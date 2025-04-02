#!/usr/bin/env node

/**
 * Migrationsskript zum Aktualisieren der Pfade in der Datenbank für Videos
 * 
 * Dieses Skript durchsucht alle Video-Dokumente in der MongoDB und aktualisiert
 * die Pfadattribute, um auf die neue Mandantengetrennte Struktur zu verweisen.
 */

require('dotenv').config(); // Lade Umgebungsvariablen
const mongoose = require('mongoose');
const { S3Client, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');

// MongoDB-Verbindungsstring
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ad-video-generator';

// S3-Konfiguration
const s3Config = {
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
};

// S3 Bucket-Name
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'ad-video-generator-bucket';

// S3-Client erstellen
const s3Client = new S3Client(s3Config);

// Kommandozeilenargumente parsen
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') ? (args[args.indexOf('--dry-run') + 1] !== 'false') : true;
const verbose = args.includes('--verbose');
const userIdFilter = args.includes('--user') ? args[args.indexOf('--user') + 1] : null;

// Schema für Video-Dokumente
const videoSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  name: String,
  path: String,
  url: String,
  size: Number,
  type: String,
  status: String,
  progress: Number,
  tags: [String],
  isPublic: Boolean,
  createdAt: Date,
  updatedAt: Date
}, { timestamps: true });

async function connectToMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    log('Mit MongoDB verbunden');
  } catch (error) {
    logError('MongoDB-Verbindungsfehler:', error);
    process.exit(1);
  }
}

async function disconnectFromMongoDB() {
  try {
    await mongoose.disconnect();
    log('MongoDB-Verbindung getrennt');
  } catch (error) {
    logError('Fehler beim Trennen der MongoDB-Verbindung:', error);
  }
}

// Hilfsfunktion, um zu prüfen, ob ein Objekt in S3 existiert
async function objectExists(key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key
    });
    await s3Client.send(command);
    return true;
  } catch (error) {
    return false;
  }
}

// Hilfsfunktion zum Extrahieren von Informationen aus einem S3-Schlüssel
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

// Hilfsfunktion für Logging
function log(message) {
  console.log(`[INFO] ${message}`);
}

function logWarning(message) {
  console.log(`[WARN] ${message}`);
}

function logError(message, error) {
  console.error(`[ERROR] ${message}`, error || '');
}

function logVerbose(message) {
  if (verbose) {
    console.log(`[VERBOSE] ${message}`);
  }
}

// Generiere die neue URL für ein Video
function generateNewS3Url(oldUrl, userId) {
  if (!oldUrl) return null;
  
  // Extrahiere den S3-Schlüssel aus der URL
  const urlParts = oldUrl.split('amazonaws.com/');
  if (urlParts.length < 2) return oldUrl; // Keine S3-URL oder ungültiges Format
  
  const s3Key = urlParts[1];
  const keyInfo = extractKeyInfo(s3Key);
  
  // Prüfe, ob der Pfad bereits im neuen Format ist
  if (keyInfo.isNewFormat) return oldUrl;
  
  // Erstelle den neuen Pfad im Format users/{userId}/{folder}/{fileName}
  const newKey = `users/${userId}/${keyInfo.folder}/${keyInfo.fileName}`;
  const newUrl = `https://${S3_BUCKET}.s3.${s3Config.region}.amazonaws.com/${newKey}`;
  
  return newUrl;
}

// Hauptfunktion zum Migrieren der Pfade
async function migrateVideoPaths() {
  try {
    log('=== VIDEO-PFAD-MIGRATIONS-SKRIPT ===');
    log(`Modus: ${dryRun ? 'SIMULATION' : 'AUSFÜHRUNG'}`);
    
    // Verbindung zur Datenbank herstellen
    await connectToMongoDB();
    
    // Video-Modell definieren
    const VideoModel = mongoose.model('Video', videoSchema);
    
    // Query für die Suche nach Videos
    const query = {};
    if (userIdFilter) {
      query.userId = userIdFilter;
      log(`Filtere nach Benutzer: ${userIdFilter}`);
    }
    
    // Alle Videos abrufen
    const videos = await VideoModel.find(query);
    log(`${videos.length} Videos für die Migration gefunden`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Verarbeite jedes Video
    for (const video of videos) {
      try {
        // Überspringe Videos ohne userId oder ohne Pfad oder URL
        if (!video.userId || (!video.path && !video.url)) {
          logWarning(`Video ${video.id} übersprungen: Fehlende userId oder Pfad/URL`);
          skippedCount++;
          continue;
        }
        
        // Generiere neue S3-URLs basierend auf der userId
        const newUrl = generateNewS3Url(video.url, video.userId);
        const newPath = generateNewS3Url(video.path, video.userId);
        
        // Überprüfe, ob Änderungen notwendig sind
        if (newUrl === video.url && newPath === video.path) {
          logVerbose(`Video ${video.id} übersprungen: Pfade bereits im richtigen Format`);
          skippedCount++;
          continue;
        }
        
        // Aktualisiere die URL und den Pfad, falls sie existieren
        const updates = {};
        if (newUrl && newUrl !== video.url) updates.url = newUrl;
        if (newPath && newPath !== video.path) updates.path = newPath;
        
        if (Object.keys(updates).length === 0) {
          logVerbose(`Video ${video.id} übersprungen: Keine Änderungen nötig`);
          skippedCount++;
          continue;
        }
        
        // Protokolliere die Änderungen
        logVerbose(`${dryRun ? 'SIMULIERT' : 'Aktualisiere'}: Video ${video.id}`);
        if (updates.url) logVerbose(`  url: ${video.url} -> ${updates.url}`);
        if (updates.path) logVerbose(`  path: ${video.path} -> ${updates.path}`);
        
        // Update durchführen, wenn nicht im Simulationsmodus
        if (!dryRun) {
          await VideoModel.updateOne({ _id: video._id }, { $set: updates });
        }
        
        updatedCount++;
      } catch (error) {
        logError(`Fehler bei der Migration von Video ${video.id}:`, error);
        errorCount++;
      }
    }
    
    // Migration abschließen
    log(`Video-Pfad-Migration abgeschlossen: ${updatedCount} aktualisiert, ${skippedCount} übersprungen, ${errorCount} fehlgeschlagen`);
    log(`HINWEIS: ${dryRun ? 'Dies war nur eine Simulation. Führe das Skript mit --dry-run false aus, um die Änderungen tatsächlich vorzunehmen.' : 'Die Änderungen wurden durchgeführt.'}`);
  } catch (error) {
    logError('Fehler bei der Migration:', error);
  } finally {
    // Verbindung zur Datenbank trennen
    await disconnectFromMongoDB();
  }
}

// Skript ausführen
migrateVideoPaths(); 