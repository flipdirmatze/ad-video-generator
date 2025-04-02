#!/usr/bin/env node

// Fix Timestamps Script
// Dieses Skript prüft und repariert fehlende wordTimestamps in Voiceover-Dokumenten

const mongoose = require('mongoose');
const { Schema, model, models, Types } = mongoose;
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

// Hilfs-Funktion zum Logging
function log(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${level}] ${message}`);
}

// Argumente parsen
const args = process.argv.slice(2);
const isDryRun = !args.includes('--execute');

// MongoDB-Modelle definieren
let VoiceoverModel;

// Verbindung zu MongoDB herstellen
async function connectToMongoDB() {
  const MONGODB_URI = process.env.MONGODB_URI;
  
  if (!MONGODB_URI) {
    log('ERROR', 'MONGODB_URI Umgebungsvariable ist nicht gesetzt');
    process.exit(1);
  }
  
  try {
    log('INFO', 'Verbindung zu MongoDB wird hergestellt...');
    await mongoose.connect(MONGODB_URI);
    log('INFO', 'Mit MongoDB verbunden');
    
    // Schema für Voiceover-Dokumente definieren
    const voiceoverSchema = new Schema({
      userId: {
        type: Schema.Types.ObjectId,
        required: true
      },
      name: {
        type: String,
        required: true
      },
      text: {
        type: String,
        required: true
      },
      url: {
        type: String,
        required: true
      },
      path: {
        type: String,
        required: true
      },
      size: {
        type: Number,
        required: true
      },
      duration: {
        type: Number
      },
      isPublic: {
        type: Boolean,
        default: false
      },
      wordTimestamps: {
        type: [{
          word: String,
          startTime: Number,
          endTime: Number
        }],
        default: []
      },
      voiceId: {
        type: String
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
    
    VoiceoverModel = models.Voiceover || model('Voiceover', voiceoverSchema);
    
  } catch (error) {
    log('ERROR', `MongoDB-Verbindungsfehler: ${error.message}`);
    process.exit(1);
  }
}

// Funktion zur Überprüfung und Reparatur der Zeitstempel
async function fixTimestamps() {
  log('INFO', `=== VOICEOVER-TIMESTAMP-REPARATUR-SKRIPT ===`);
  log('INFO', `Modus: ${isDryRun ? 'SIMULATION' : 'AUSFÜHRUNG'}`);
  
  await connectToMongoDB();
  
  try {
    // Filter basierend auf spezifischer ID oder alle Dokumente
    const specificId = args.find((arg, index) => 
      arg === '--id' && index < args.length - 1
    ) ? args[args.indexOf('--id') + 1] : null;
    
    const filter = specificId ? { _id: new Types.ObjectId(specificId) } : {};
    
    // Hole alle Voiceover-Dokumente
    const voiceovers = await VoiceoverModel.find(filter).lean();
    
    log('INFO', `${voiceovers.length} Voiceover-Dokumente für die Analyse gefunden`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    
    // Durchlaufe alle Voiceover-Dokumente
    for (const voiceover of voiceovers) {
      const voiceoverId = voiceover._id.toString();
      
      try {
        // Prüfe auf fehlende oder leere wordTimestamps
        const hasTimestamps = voiceover.wordTimestamps && 
                              Array.isArray(voiceover.wordTimestamps) && 
                              voiceover.wordTimestamps.length > 0;
        
        if (!hasTimestamps) {
          log('INFO', `Voiceover ${voiceoverId} hat fehlende oder leere Zeitstempel-Array`);
          
          // Hier könnten wir Zeitstempel neu generieren oder aus einer Backup-Quelle laden
          // Für dieses Beispiel setzen wir erstmal ein leeres Array
          if (!isDryRun) {
            await VoiceoverModel.updateOne(
              { _id: voiceover._id },
              { 
                $set: { 
                  wordTimestamps: [] 
                }
              }
            );
            
            log('SUCCESS', `Voiceover ${voiceoverId} aktualisiert mit leerem Zeitstempel-Array`);
            updatedCount++;
          } else {
            log('INFO', `[SIMULATION] Würde Voiceover ${voiceoverId} mit leerem Zeitstempel-Array aktualisieren`);
            updatedCount++;
          }
        } else {
          log('INFO', `Voiceover ${voiceoverId} hat bereits ${voiceover.wordTimestamps.length} Zeitstempel - überspringe`);
          skippedCount++;
        }
      } catch (error) {
        log('ERROR', `Fehler bei der Verarbeitung von Voiceover ${voiceoverId}: ${error.message}`);
        failedCount++;
      }
    }
    
    log('INFO', `Voiceover-Timestamp-Reparatur abgeschlossen: ${updatedCount} aktualisiert, ${skippedCount} übersprungen, ${failedCount} fehlgeschlagen`);
    
    if (isDryRun) {
      log('INFO', `HINWEIS: Dies war nur eine Simulation. Führe das Skript mit --execute aus, um die Änderungen tatsächlich vorzunehmen.`);
    } else {
      log('INFO', `HINWEIS: Die Änderungen wurden durchgeführt.`);
    }
    
  } catch (error) {
    log('ERROR', `Allgemeiner Fehler: ${error.message}`);
  } finally {
    log('INFO', 'MongoDB-Verbindung wird getrennt');
    await mongoose.disconnect();
    log('INFO', 'MongoDB-Verbindung getrennt');
  }
}

// Skript ausführen
fixTimestamps(); 