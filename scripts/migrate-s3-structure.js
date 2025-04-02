#!/usr/bin/env node

/**
 * Migrations-Skript für die Umstellung auf mandantensichere S3-Pfade
 * ----------------------------------------------------------------
 * 
 * Dieses Skript migriert bestehende S3-Dateien und Datenbank-Einträge
 * von der alten Struktur (z.B. uploads/, final/, audio/) 
 * zur neuen mandantensicheren Struktur (users/{userId}/uploads/, users/{userId}/final/, usw.)
 * 
 * Anleitung zur Verwendung:
 * 1. Stelle sicher, dass AWS CLI konfiguriert ist (aws configure)
 * 2. Stelle sicher, dass deine MongoDB-Verbindung in .env konfiguriert ist
 * 3. Führe das Skript aus: node scripts/migrate-s3-structure.js
 * 
 * Optionen:
 * --dry-run: Simuliert die Migration ohne tatsächliche Änderungen (Standard: true)
 * --verbose: Gibt ausführliche Protokolle aus
 * --user <userId>: Migriert nur Dateien eines bestimmten Benutzers
 * 
 * Beispiel:
 * node scripts/migrate-s3-structure.js --dry-run false --verbose --user 123456
 */

require('dotenv').config();
const { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const mongoose = require('mongoose');
const { execSync } = require('child_process');

// Mongoose-Modelle
const VideoSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  userId: { type: String, required: true },
  videoKey: String,
  fileUrl: String,
  tags: [String],
  uploadedAt: Date,
});

const VoiceoverSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: String, required: true },
  url: String,
  path: String,
  text: String,
  size: Number,
  wordTimestamps: Array,
});

const ProjectSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: String, required: true },
  title: String,
  description: String,
  templateDataPath: String,
  status: String,
});

// Definiere die Modelle
const VideoModel = mongoose.model('Video', VideoSchema);
const VoiceoverModel = mongoose.model('Voiceover', VoiceoverSchema);
const ProjectModel = mongoose.model('Project', ProjectSchema);

// Konfiguration
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-central-1'
});
const bucketName = process.env.S3_BUCKET_NAME;

// CLI-Argumente parsen
const args = process.argv.slice(2);
const config = {
  dryRun: true,          // Simulationsmodus, keine echten Änderungen
  verbose: false,        // Ausführliche Logs
  userId: null,          // Spezifischer Benutzer für die Migration
  keepOriginal: true     // Originaldateien nach der Migration behalten
};

// Argumente verarbeiten
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dry-run') {
    config.dryRun = args[i+1] !== 'false';
    i++;
  } else if (args[i] === '--verbose') {
    config.verbose = true;
  } else if (args[i] === '--user') {
    config.userId = args[i+1];
    i++;
  } else if (args[i] === '--keep-original') {
    config.keepOriginal = args[i+1] !== 'false';
    i++;
  }
}

// Logging-Funktionen
function log(message) {
  console.log(`[INFO] ${message}`);
}

function verbose(message) {
  if (config.verbose) {
    console.log(`[VERBOSE] ${message}`);
  }
}

function warn(message) {
  console.warn(`[WARN] ${message}`);
}

function error(message) {
  console.error(`[ERROR] ${message}`);
}

// Utility-Funktionen
async function listS3Objects(prefix = '') {
  const command = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: prefix
  });
  
  const data = await s3Client.send(command);
  return data.Contents || [];
}

async function copyS3Object(sourceKey, destinationKey) {
  if (config.dryRun) {
    verbose(`SIMULIERT: Kopiere ${sourceKey} nach ${destinationKey}`);
    return true;
  }
  
  try {
    const command = new CopyObjectCommand({
      Bucket: bucketName,
      CopySource: `${bucketName}/${sourceKey}`,
      Key: destinationKey
    });
    
    await s3Client.send(command);
    verbose(`Kopiert: ${sourceKey} -> ${destinationKey}`);
    return true;
  } catch (err) {
    error(`Fehler beim Kopieren von ${sourceKey}: ${err.message}`);
    return false;
  }
}

async function deleteS3Object(key) {
  if (config.dryRun || config.keepOriginal) {
    verbose(`SIMULIERT: Lösche ${key}`);
    return true;
  }
  
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key
    });
    
    await s3Client.send(command);
    verbose(`Gelöscht: ${key}`);
    return true;
  } catch (err) {
    error(`Fehler beim Löschen von ${key}: ${err.message}`);
    return false;
  }
}

async function updateVideoDocument(videoId, oldKey, newKey) {
  if (config.dryRun) {
    verbose(`SIMULIERT: Aktualisiere Video ${videoId}: videoKey von ${oldKey} zu ${newKey}`);
    return true;
  }
  
  try {
    await VideoModel.findByIdAndUpdate(videoId, { 
      videoKey: newKey,
      fileUrl: generateS3Url(newKey)
    });
    
    verbose(`Aktualisiert: Video ${videoId} mit neuem Pfad ${newKey}`);
    return true;
  } catch (err) {
    error(`Fehler beim Aktualisieren von Video ${videoId}: ${err.message}`);
    return false;
  }
}

async function updateVoiceoverDocument(voiceoverId, oldUrl, newUrl, newPath) {
  if (config.dryRun) {
    verbose(`SIMULIERT: Aktualisiere Voiceover ${voiceoverId}: url von ${oldUrl} zu ${newUrl}`);
    return true;
  }
  
  try {
    await VoiceoverModel.findByIdAndUpdate(voiceoverId, { 
      url: newUrl,
      path: newPath
    });
    
    verbose(`Aktualisiert: Voiceover ${voiceoverId} mit neuer URL ${newUrl}`);
    return true;
  } catch (err) {
    error(`Fehler beim Aktualisieren von Voiceover ${voiceoverId}: ${err.message}`);
    return false;
  }
}

async function updateProjectDocument(projectId, oldPath, newPath) {
  if (config.dryRun) {
    verbose(`SIMULIERT: Aktualisiere Projekt ${projectId}: templateDataPath von ${oldPath} zu ${newPath}`);
    return true;
  }
  
  try {
    await ProjectModel.findByIdAndUpdate(projectId, { 
      templateDataPath: newPath
    });
    
    verbose(`Aktualisiert: Projekt ${projectId} mit neuem templateDataPath ${newPath}`);
    return true;
  } catch (err) {
    error(`Fehler beim Aktualisieren von Projekt ${projectId}: ${err.message}`);
    return false;
  }
}

function generateS3Url(key) {
  const region = process.env.AWS_REGION || 'eu-central-1';
  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;
}

function extractKeyInfo(key) {
  const parts = key.split('/');
  
  // Überprüfe, ob der Pfad bereits die neue Struktur hat
  if (parts[0] === 'users' && parts.length >= 3) {
    return {
      isNewFormat: true,
      userId: parts[1],
      folder: parts[2],
      fileName: parts.slice(3).join('/')
    };
  }
  
  // Alte Struktur
  return {
    isNewFormat: false,
    folder: parts[0],
    fileName: parts.slice(1).join('/')
  };
}

// Hauptfunktionen
async function migrateVideos() {
  log('Starte Migration der Videos...');
  
  // Alle Videos aus der Datenbank abrufen
  const query = config.userId ? { userId: config.userId } : {};
  const videos = await VideoModel.find(query);
  
  log(`${videos.length} Videos für die Migration gefunden`);
  
  let migrated = 0;
  let failed = 0;
  
  for (const video of videos) {
    const userId = video.userId?.toString();
    const videoKey = video.videoKey;
    
    // Überspringe Videos ohne Benutzer-ID oder Schlüssel
    if (!userId || !videoKey) {
      warn(`Video ${video._id} übersprungen: Fehlende userId oder videoKey`);
      continue;
    }
    
    // Analysiere den aktuellen Schlüssel
    const keyInfo = extractKeyInfo(videoKey);
    
    // Überspringe, wenn bereits im neuen Format
    if (keyInfo.isNewFormat) {
      verbose(`Video ${video._id} ist bereits im neuen Format: ${videoKey}`);
      continue;
    }
    
    // Erstelle den neuen Schlüssel
    const newKey = `users/${userId}/${keyInfo.folder}/${keyInfo.fileName}`;
    
    // Kopiere die Datei
    const copySuccess = await copyS3Object(videoKey, newKey);
    
    if (copySuccess) {
      // Aktualisiere den Datenbankeintrag
      const updateSuccess = await updateVideoDocument(video._id, videoKey, newKey);
      
      if (updateSuccess) {
        migrated++;
        
        // Lösche die Originaldatei, wenn konfiguriert
        if (!config.keepOriginal) {
          await deleteS3Object(videoKey);
        }
      } else {
        failed++;
      }
    } else {
      failed++;
    }
  }
  
  log(`Video-Migration abgeschlossen: ${migrated} migriert, ${failed} fehlgeschlagen`);
}

async function migrateVoiceovers() {
  log('Starte Migration der Voiceovers...');
  
  // Alle Voiceovers aus der Datenbank abrufen
  const query = config.userId ? { userId: config.userId } : {};
  const voiceovers = await VoiceoverModel.find(query);
  
  log(`${voiceovers.length} Voiceovers für die Migration gefunden`);
  
  let migrated = 0;
  let failed = 0;
  
  for (const voiceover of voiceovers) {
    const userId = voiceover.userId?.toString();
    const url = voiceover.url;
    const path = voiceover.path;
    
    // Überspringe Voiceovers ohne Benutzer-ID oder URL
    if (!userId || !url || !path) {
      warn(`Voiceover ${voiceover._id} übersprungen: Fehlende userId, url oder path`);
      continue;
    }
    
    // Extrahiere den S3-Schlüssel aus der URL
    const urlParts = url.split('amazonaws.com/');
    if (urlParts.length < 2) {
      warn(`Voiceover ${voiceover._id} übersprungen: Ungültige URL ${url}`);
      continue;
    }
    
    const key = urlParts[1];
    const keyInfo = extractKeyInfo(key);
    
    // Überspringe, wenn bereits im neuen Format
    if (keyInfo.isNewFormat) {
      verbose(`Voiceover ${voiceover._id} ist bereits im neuen Format: ${key}`);
      continue;
    }
    
    // Erstelle den neuen Schlüssel und Pfad
    const newKey = `users/${userId}/${keyInfo.folder}/${keyInfo.fileName}`;
    const newPath = `users/${userId}/${path}`;
    const newUrl = generateS3Url(newKey);
    
    // Kopiere die Datei
    const copySuccess = await copyS3Object(key, newKey);
    
    if (copySuccess) {
      // Aktualisiere den Datenbankeintrag
      const updateSuccess = await updateVoiceoverDocument(voiceover._id, url, newUrl, newPath);
      
      if (updateSuccess) {
        migrated++;
        
        // Lösche die Originaldatei, wenn konfiguriert
        if (!config.keepOriginal) {
          await deleteS3Object(key);
        }
      } else {
        failed++;
      }
    } else {
      failed++;
    }
  }
  
  log(`Voiceover-Migration abgeschlossen: ${migrated} migriert, ${failed} fehlgeschlagen`);
}

async function migrateProjects() {
  log('Starte Migration der Projekte...');
  
  // Alle Projekte aus der Datenbank abrufen
  const query = config.userId ? { userId: config.userId } : {};
  const projects = await ProjectModel.find(query);
  
  log(`${projects.length} Projekte für die Migration gefunden`);
  
  let migrated = 0;
  let failed = 0;
  
  for (const project of projects) {
    const userId = project.userId?.toString();
    const templateDataPath = project.templateDataPath;
    
    // Überspringe Projekte ohne Benutzer-ID oder Template-Daten-Pfad
    if (!userId || !templateDataPath) {
      verbose(`Projekt ${project._id} übersprungen: Fehlende userId oder templateDataPath`);
      continue;
    }
    
    // Analysiere den aktuellen Pfad
    const keyInfo = extractKeyInfo(templateDataPath);
    
    // Überspringe, wenn bereits im neuen Format
    if (keyInfo.isNewFormat) {
      verbose(`Projekt ${project._id} ist bereits im neuen Format: ${templateDataPath}`);
      continue;
    }
    
    // Erstelle den neuen Pfad
    const newPath = `users/${userId}/${keyInfo.folder}/${keyInfo.fileName}`;
    
    // Kopiere die Datei
    const copySuccess = await copyS3Object(templateDataPath, newPath);
    
    if (copySuccess) {
      // Aktualisiere den Datenbankeintrag
      const updateSuccess = await updateProjectDocument(project._id, templateDataPath, newPath);
      
      if (updateSuccess) {
        migrated++;
        
        // Lösche die Originaldatei, wenn konfiguriert
        if (!config.keepOriginal) {
          await deleteS3Object(templateDataPath);
        }
      } else {
        failed++;
      }
    } else {
      failed++;
    }
  }
  
  log(`Projekt-Migration abgeschlossen: ${migrated} migriert, ${failed} fehlgeschlagen`);
}

// Hauptfunktion
async function main() {
  try {
    log('=== S3-MIGRATIONS-SKRIPT ===');
    log(`Modus: ${config.dryRun ? 'SIMULATION' : 'AUSFÜHRUNG'}`);
    log(`Bucket: ${bucketName}`);
    log(`UserID Filter: ${config.userId || 'Alle Benutzer'}`);
    log(`Originaldateien behalten: ${config.keepOriginal ? 'Ja' : 'Nein'}`);
    
    // MongoDB-Verbindung herstellen
    await mongoose.connect(process.env.MONGODB_URI);
    log('Mit MongoDB verbunden');
    
    // Migriere Videos, Voiceovers und Projekte
    await migrateVideos();
    await migrateVoiceovers();
    await migrateProjects();
    
    log('Migration abgeschlossen');
    
    if (config.dryRun) {
      log('HINWEIS: Dies war nur eine Simulation. Führe das Skript mit --dry-run false aus, um die Änderungen tatsächlich vorzunehmen.');
    }
    
    // MongoDB-Verbindung trennen
    await mongoose.disconnect();
    log('MongoDB-Verbindung getrennt');
    
  } catch (err) {
    error(`Unerwarteter Fehler: ${err.message}`);
    error(err.stack);
    process.exit(1);
  }
}

// Skript ausführen
main(); 