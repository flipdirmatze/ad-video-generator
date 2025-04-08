#!/usr/bin/env node

/**
 * Migration von Video-Pfaden
 * 
 * Dieses Skript aktualisiert die pfadreferenzen in der MongoDB, damit sie
 * korrekt auf Dateien im S3-Bucket verweisen.
 * 
 * Durch die Umstellung auf eine mandantensichere Struktur müssen die Pfade
 * von der alten Struktur (z.B. final/video.mp4)
 * zur neuen mandantensicheren Struktur (users/{userId}/final/video.mp4) umgewandelt werden.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Schema, model, models, Types } = mongoose;
const { S3Client, CopyObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { URL } = require('url');

// Globale Konfiguration
const bucketName = process.env.S3_BUCKET_NAME || 'ad-video-generator-bucket';
const s3Region = process.env.AWS_REGION || 'eu-central-1';

// S3 Client
const s3Client = new S3Client({
  region: s3Region,
  // Kein explizites Übergeben von credentials - AWS SDK nimmt diese aus der Umgebung oder aus ~/.aws/credentials
});

// Hilfs-Funktion zum Logging
function log(level, message) {
  console.log(`[${level}] ${message}`);
}

// Schema für Video-Modell
const videoSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  url: {
    type: String,
    required: true
  },
  path: {
    type: String,
    required: true
  },
  thumbnailUrl: String,
  thumbnailPath: String,
  duration: Number,
  status: {
    type: String,
    enum: ['processing', 'complete', 'failed', 'draft'],
    default: 'draft'
  },
  privacy: {
    type: String,
    enum: ['public', 'private', 'unlisted'],
    default: 'private'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Schema für Projekt-Modell
const projectSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    default: 'Untitled Project'
  },
  description: String,
  segments: [{
    url: String,
    path: String,
    startTime: Number,
    duration: Number,
    position: Number
  }],
  voiceover: {
    type: Schema.Types.ObjectId,
    ref: 'Voiceover'
  },
  subtitles: {
    enabled: Boolean,
    options: {
      fontName: String,
      fontSize: Number,
      primaryColor: String,
      backgroundColor: String,
      borderStyle: Number,
      position: String
    }
  },
  templateDataPath: String,
  outputPath: String,
  status: {
    type: String,
    enum: ['draft', 'processing', 'complete', 'failed'],
    default: 'draft'
  },
  jobId: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Argumente parsen
const args = process.argv.slice(2);
const isDryRun = !args.includes('--dry-run=false');

// Verbindung zu MongoDB herstellen
async function connectToMongoDB() {
  try {
    log('INFO', 'Verbindung zu MongoDB wird hergestellt...');
    await mongoose.connect(process.env.MONGODB_URI);
    log('INFO', 'Mit MongoDB verbunden');
    
    // Models registrieren
    mongoose.models.Video = models.Video || model('Video', videoSchema);
    mongoose.models.Project = models.Project || model('Project', projectSchema);
    
  } catch (error) {
    log('ERROR', `MongoDB-Verbindungsfehler: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Generiert einen S3-URL für einen Pfad
 */
function getS3Url(path) {
  return `https://${bucketName}.s3.${s3Region}.amazonaws.com/${path}`;
}

/**
 * Extrahiert den S3-Pfad aus einer URL
 */
function extractPathFromUrl(url) {
  try {
    const parsedUrl = new URL(url);
    // Remove leading slash if present
    const path = parsedUrl.pathname.startsWith('/') ? parsedUrl.pathname.substring(1) : parsedUrl.pathname;
    return path;
  } catch (error) {
    log('WARN', `Konnte Pfad nicht aus URL extrahieren: ${url}, ${error.message}`);
    return null;
  }
}

/**
 * Konvertiert einen alten Pfad zu einem neuen mandantensicheren Pfad
 */
function convertToUserScopedPath(oldPath, userId) {
  if (!oldPath) return null;
  
  // Wenn der Pfad bereits mandantensicher ist, zurückgeben
  if (oldPath.startsWith(`users/${userId}/`)) {
    return oldPath;
  }
  
  const folderMatch = oldPath.match(/^(audio|uploads|processed|final|output|config)\/(.*)/);
  if (folderMatch) {
    const [, folder, restPath] = folderMatch;
    return `users/${userId}/${folder}/${restPath}`;
  }
  
  return null;
}

/**
 * Kopiert eine Datei in S3 zum neuen Pfad
 */
async function copyS3Object(sourcePath, targetPath) {
  if (isDryRun) {
    log('INFO', `[SIMULATION] Würde S3-Objekt kopieren: ${sourcePath} -> ${targetPath}`);
    return true;
  }
  
  try {
    const command = new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `${bucketName}/${sourcePath}`,
      Key: targetPath
    });
    
    await s3Client.send(command);
    log('SUCCESS', `S3-Objekt kopiert: ${sourcePath} -> ${targetPath}`);
    return true;
  } catch (error) {
    log('ERROR', `S3-Fehler beim Kopieren von ${sourcePath} -> ${targetPath}: ${error.message}`);
    return false;
  }
}

/**
 * Listet Objekte in einem S3-Pfad auf
 */
async function listS3Objects(prefix) {
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      MaxKeys: 1000
    });
    
    const response = await s3Client.send(command);
    return response.Contents || [];
  } catch (error) {
    log('ERROR', `Fehler beim Auflisten von S3-Objekten in ${prefix}: ${error.message}`);
    return [];
  }
}

/**
 * Migriert Dateien direkt aus S3, ohne auf Datenbankeinträge zu warten
 */
async function migrateS3Files() {
  log('INFO', '=== DIREKTE S3-MIGRATION ===');
  
  // Alle Benutzer-IDs sammeln
  const VideoModel = mongoose.models.Video;
  const ProjectModel = mongoose.models.Project;
  
  const allVideos = await VideoModel.find({}).lean();
  const allProjects = await ProjectModel.find({}).lean();
  
  const userIds = new Set();
  
  allVideos.forEach(video => {
    if (video.userId) {
      userIds.add(video.userId.toString());
    }
  });
  
  allProjects.forEach(project => {
    if (project.userId) {
      userIds.add(project.userId.toString());
    }
  });
  
  log('INFO', `Gefundene Benutzer-IDs für die Migration: ${userIds.size}`);
  
  // Ordner zum Migrieren
  const foldersToMigrate = ['final', 'output', 'config', 'processed'];
  
  let migratedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  
  // Für jeden Ordner
  for (const folder of foldersToMigrate) {
    log('INFO', `Prüfe Ordner: ${folder}/`);
    
    // Liste alle Objekte im Ordner
    const objects = await listS3Objects(`${folder}/`);
    
    log('INFO', `${objects.length} Objekte in ${folder}/ gefunden`);
    
    // Objekte nach Top-Level-Dateien und Unterordnern aufteilen
    const topLevelFiles = objects.filter(obj => {
      const key = obj.Key;
      return key.split('/').length === 2; // z.B. "final/file.mp4"
    });
    
    const subfolders = new Set();
    objects.forEach(obj => {
      const parts = obj.Key.split('/');
      if (parts.length > 2) {
        subfolders.add(parts[1]); // z.B. "final/userId/file.mp4" -> userId
      }
    });
    
    log('INFO', `${topLevelFiles.length} Top-Level-Dateien und ${subfolders.size} Unterordner gefunden`);
    
    // Prüfe für jeden Benutzer, ob bereits ein Unterordner existiert
    for (const userId of userIds) {
      if (subfolders.has(userId)) {
        log('INFO', `Benutzer ${userId} hat bereits einen Unterordner in ${folder}/`);
        continue;
      }
      
      // Für jede Top-Level-Datei
      for (const obj of topLevelFiles) {
        const sourceKey = obj.Key;
        const fileName = sourceKey.split('/').pop();
        const targetKey = `users/${userId}/${folder}/${fileName}`;
        
        // Kopiere die Datei
        if (!isDryRun) {
          log('INFO', `Kopiere ${sourceKey} -> ${targetKey}`);
          const copySuccess = await copyS3Object(sourceKey, targetKey);
          
          if (copySuccess) {
            migratedCount++;
          } else {
            failedCount++;
          }
        } else {
          log('INFO', `[SIMULATION] Würde kopieren: ${sourceKey} -> ${targetKey}`);
          migratedCount++;
        }
      }
    }
  }
  
  log('INFO', `Direkte S3-Migration abgeschlossen: ${migratedCount} migriert, ${skippedCount} übersprungen, ${failedCount} fehlgeschlagen`);
}

/**
 * Führt die Video-Pfad-Migration durch
 */
async function migrateVideoPaths() {
  log('INFO', `=== VIDEO-PFAD-MIGRATIONS-SKRIPT ===`);
  log('INFO', `Modus: ${isDryRun ? 'SIMULATION' : 'AUSFÜHRUNG'}`);
  
  await connectToMongoDB();
  
  try {
    // Holen aller Videos aus der Datenbank
    const VideoModel = mongoose.models.Video;
    const videos = await VideoModel.find({}).lean();
    
    log('INFO', `${videos.length} Videos für die Migration gefunden`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    
    // Durchlaufe alle Videos
    for (const video of videos) {
      const videoId = video._id.toString();
      const userId = video.userId?.toString();
      
      if (!userId) {
        log('WARN', `Video ${videoId} hat keine userId, überspringe...`);
        skippedCount++;
        continue;
      }
      
      // Aktuelle Pfade
      const currentPath = video.path;
      const currentUrl = video.url;
      
      // Extrahiere Pfad aus URL, falls der Pfad nicht direkt verfügbar ist
      const extractedPath = !currentPath && currentUrl ? extractPathFromUrl(currentUrl) : null;
      const sourcePath = currentPath || extractedPath;
      
      if (!sourcePath) {
        log('WARN', `Video ${videoId} hat keinen gültigen Pfad oder URL, überspringe...`);
        skippedCount++;
        continue;
      }
      
      // Konvertiere zu mandantensicherem Pfad
      const newPath = convertToUserScopedPath(sourcePath, userId);
      
      if (!newPath) {
        log('WARN', `Konnte keinen neuen Pfad für Video ${videoId} generieren, überspringe...`);
        skippedCount++;
        continue;
      }
      
      // Keine Änderung erforderlich
      if (newPath === sourcePath) {
        log('INFO', `Video ${videoId} hat bereits den korrekten Pfad ${sourcePath}, überspringe...`);
        skippedCount++;
        continue;
      }
      
      const newUrl = getS3Url(newPath);
      
      log('INFO', `Aktualisiere Video ${videoId}:`);
      log('INFO', `  Alter Pfad:   ${sourcePath}`);
      log('INFO', `  Neuer Pfad:   ${newPath}`);
      log('INFO', `  Alte URL:     ${currentUrl}`);
      log('INFO', `  Neue URL:     ${newUrl}`);
      
      // Kopiere S3-Objekt, wenn nicht im Dry-Run-Modus
      if (!isDryRun) {
        const copySuccess = await copyS3Object(sourcePath, newPath);
        
        if (copySuccess) {
          // Aktualisiere Datenbank-Eintrag
          await VideoModel.updateOne(
            { _id: video._id },
            {
              $set: {
                path: newPath,
                url: newUrl
              }
            }
          );
          
          log('SUCCESS', `Video ${videoId} erfolgreich aktualisiert`);
          updatedCount++;
        } else {
          log('ERROR', `Konnte S3-Objekt für Video ${videoId} nicht kopieren, überspringe Datenbank-Update`);
          failedCount++;
        }
      } else {
        log('INFO', `[SIMULATION] Würde Video ${videoId} aktualisieren`);
        updatedCount++;
      }
    }
    
    // Jetzt migrieren wir auch die Projekt-Pfade
    const ProjectModel = mongoose.models.Project;
    const projects = await ProjectModel.find({}).lean();
    
    log('INFO', `${projects.length} Projekte für die Migration gefunden`);
    
    let projectUpdatedCount = 0;
    let projectSkippedCount = 0;
    let projectFailedCount = 0;
    
    // Durchlaufe alle Projekte
    for (const project of projects) {
      const projectId = project._id.toString();
      const userId = project.userId?.toString();
      
      if (!userId) {
        log('WARN', `Projekt ${projectId} hat keine userId, überspringe...`);
        projectSkippedCount++;
        continue;
      }
      
      let needsUpdate = false;
      const updates = {};
      
      // Prüfe Template-Daten-Pfad
      if (project.templateDataPath) {
        const newTemplatePath = convertToUserScopedPath(project.templateDataPath, userId);
        
        if (newTemplatePath && newTemplatePath !== project.templateDataPath) {
          log('INFO', `Aktualisiere Template-Pfad für Projekt ${projectId}: ${project.templateDataPath} -> ${newTemplatePath}`);
          
          if (!isDryRun) {
            await copyS3Object(project.templateDataPath, newTemplatePath);
          }
          
          updates.templateDataPath = newTemplatePath;
          needsUpdate = true;
        }
      }
      
      // Prüfe Output-Pfad
      if (project.outputPath) {
        const newOutputPath = convertToUserScopedPath(project.outputPath, userId);
        
        if (newOutputPath && newOutputPath !== project.outputPath) {
          log('INFO', `Aktualisiere Output-Pfad für Projekt ${projectId}: ${project.outputPath} -> ${newOutputPath}`);
          
          if (!isDryRun) {
            await copyS3Object(project.outputPath, newOutputPath);
          }
          
          updates.outputPath = newOutputPath;
          needsUpdate = true;
        }
      }
      
      // Prüfe Segment-Pfade
      if (Array.isArray(project.segments)) {
        const updatedSegments = project.segments.map(segment => {
          if (segment.path) {
            const newSegmentPath = convertToUserScopedPath(segment.path, userId);
            
            if (newSegmentPath && newSegmentPath !== segment.path) {
              log('INFO', `Aktualisiere Segment-Pfad für Projekt ${projectId}: ${segment.path} -> ${newSegmentPath}`);
              
              if (!isDryRun) {
                copyS3Object(segment.path, newSegmentPath);
              }
              
              segment.path = newSegmentPath;
              segment.url = getS3Url(newSegmentPath);
              needsUpdate = true;
            }
          }
          return segment;
        });
        
        if (needsUpdate) {
          updates.segments = updatedSegments;
        }
      }
      
      // Aktualisiere Projekt in der Datenbank
      if (needsUpdate) {
        if (!isDryRun) {
          await ProjectModel.updateOne(
            { _id: project._id },
            { $set: updates }
          );
          
          log('SUCCESS', `Projekt ${projectId} erfolgreich aktualisiert`);
          projectUpdatedCount++;
        } else {
          log('INFO', `[SIMULATION] Würde Projekt ${projectId} aktualisieren`);
          projectUpdatedCount++;
        }
      } else {
        log('INFO', `Projekt ${projectId} benötigt keine Aktualisierung, überspringe...`);
        projectSkippedCount++;
      }
    }
    
    log('INFO', `Video-Pfad-Migration abgeschlossen: ${updatedCount} aktualisiert, ${skippedCount} übersprungen, ${failedCount} fehlgeschlagen`);
    log('INFO', `Projekt-Pfad-Migration abgeschlossen: ${projectUpdatedCount} aktualisiert, ${projectSkippedCount} übersprungen, ${projectFailedCount} fehlgeschlagen`);
    
    // Direkte S3-Migration durchführen
    await migrateS3Files();
    
    log('INFO', `HINWEIS: ${isDryRun ? 'Dies war nur eine Simulation. Führe das Skript mit --dry-run=false aus, um die Änderungen tatsächlich vorzunehmen.' : 'Die Änderungen wurden durchgeführt.'}`);
    
  } catch (error) {
    log('ERROR', `Allgemeiner Fehler: ${error.message}`);
  } finally {
    log('INFO', 'MongoDB-Verbindung getrennt');
    await mongoose.disconnect();
  }
}

// Skript ausführen
migrateVideoPaths(); 