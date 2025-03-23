#!/usr/bin/env node

/**
 * FFmpeg Video-Verarbeitungs-Skript für AWS Batch
 * 
 * Dieses Skript wird in einem Docker-Container ausgeführt und verarbeitet Videos basierend
 * auf den Umgebungsvariablen, die von AWS Batch übergeben werden.
 * 
 * Umgebungsvariablen:
 * - JOB_TYPE: 'trim', 'concat', 'voiceover', 'complete', 'generate-final'
 * - INPUT_VIDEO_URL: URL des Eingabevideos
 * - OUTPUT_KEY: S3-Schlüssel für die Ausgabedatei
 * - USER_ID: ID des Benutzers, der den Job gestartet hat
 * - TEMPLATE_DATA: JSON-String mit Template-Daten
 * - TEMPLATE_DATA_PATH: S3-Pfad zur JSON-Datei mit Template-Daten
 * - S3_BUCKET: Name des S3-Buckets
 * - AWS_REGION: AWS-Region
 * - BATCH_CALLBACK_SECRET: Secret-Key für die Callback-API
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

// Für Node.js-Umgebungen ohne globales fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Temporäre Verzeichnisse für Dateien
const TEMP_DIR = '/tmp/video-processing';
const INPUT_DIR = `${TEMP_DIR}/input`;
const OUTPUT_DIR = `${TEMP_DIR}/output`;

// Aktiviere Debug-Modus
const DEBUG = process.env.DEBUG === 'true';

// Hilfsvariablen aus Environment-Variablen
const ADD_SUBTITLES = process.env.ADD_SUBTITLES === 'true';
const SUBTITLE_TEXT = process.env.SUBTITLE_TEXT || '';

// Untertitel-Styling-Optionen aus Umgebungsvariablen
const SUBTITLE_FONT_NAME = process.env.SUBTITLE_FONT_NAME || 'Arial';
const SUBTITLE_FONT_SIZE = process.env.SUBTITLE_FONT_SIZE || '24';
const SUBTITLE_PRIMARY_COLOR = process.env.SUBTITLE_PRIMARY_COLOR || '#FFFFFF';
const SUBTITLE_BACKGROUND_COLOR = process.env.SUBTITLE_BACKGROUND_COLOR || '#80000000';
const SUBTITLE_BORDER_STYLE = process.env.SUBTITLE_BORDER_STYLE || '4';
const SUBTITLE_POSITION = process.env.SUBTITLE_POSITION || 'bottom';

// Logge alle Umgebungsvariablen für Debugging (ohne sensible Daten)
console.log('Environment variables:');
Object.keys(process.env).forEach(key => {
  if (!['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'BATCH_CALLBACK_SECRET'].includes(key)) {
    if (key === 'TEMPLATE_DATA' && process.env[key]) {
      console.log(`${key}: (length: ${process.env[key].length})`);
      try {
        const templateData = JSON.parse(process.env[key]);
        console.log('TEMPLATE_DATA parsed successfully:');
        console.log('- segments:', templateData.segments ? templateData.segments.length : 0);
        console.log('- voiceoverId:', templateData.voiceoverId || 'None');
        console.log('- options:', JSON.stringify(templateData.options || {}));
      } catch (e) {
        console.error('Failed to parse TEMPLATE_DATA:', e.message);
        console.log('TEMPLATE_DATA (first 200 chars):', process.env[key].substring(0, 200));
        console.log('TEMPLATE_DATA (last 200 chars):', process.env[key].substring(process.env[key].length - 200));
      }
    } else if (process.env[key] && process.env[key].length > 100) {
      console.log(`${key}: ${process.env[key].substring(0, 100)}... (truncated, length: ${process.env[key].length})`);
    } else {
      console.log(`${key}: ${process.env[key]}`);
    }
  } else {
    console.log(`${key}: ***REDACTED***`);
  }
});

// Umgebungsvariablen aus AWS Batch
const JOB_TYPE = process.env.JOB_TYPE || 'generate-final';
const INPUT_VIDEO_URL = process.env.INPUT_VIDEO_URL || '';
const OUTPUT_KEY = process.env.OUTPUT_KEY || '';
const USER_ID = process.env.USER_ID || '';
const S3_BUCKET = process.env.S3_BUCKET || process.env.S3_BUCKET_NAME || '';
const AWS_REGION = process.env.AWS_REGION || 'eu-central-1';
const BATCH_CALLBACK_SECRET = process.env.BATCH_CALLBACK_SECRET || '';
const BATCH_CALLBACK_URL = process.env.BATCH_CALLBACK_URL || 'https://ad-video-generator.vercel.app/api/batch-callback';
const AWS_BATCH_JOB_ID = process.env.AWS_BATCH_JOB_ID || '';
const PROJECT_ID = process.env.PROJECT_ID || '';

// Initialisiere den S3-Client
const s3Client = new S3Client({
  region: AWS_REGION
});
console.log(`Initialized S3 client with region: ${AWS_REGION}`);

// Log the actual callback URL we're using
console.log(`Using callback URL: ${BATCH_CALLBACK_URL}`);

// Parse TEMPLATE_DATA with improved error handling
let TEMPLATE_DATA = null;
try {
  if (process.env.TEMPLATE_DATA) {
    // Trim any whitespace that might cause JSON parsing issues
    const templateDataStr = process.env.TEMPLATE_DATA.trim();
    console.log(`TEMPLATE_DATA length: ${templateDataStr.length}`);
    
    TEMPLATE_DATA = JSON.parse(templateDataStr);
    
    // Extra debug for voiceover
    console.log('DEBUG VOICEOVER INFO:');
    console.log('- process.env.VOICEOVER_URL:', process.env.VOICEOVER_URL);
    console.log('- process.env.VOICEOVER_KEY:', process.env.VOICEOVER_KEY);
    console.log('- process.env.VOICEOVER_ID:', process.env.VOICEOVER_ID);
    console.log('- TEMPLATE_DATA.voiceoverId:', TEMPLATE_DATA.voiceoverId);
    
    // Check if TEMPLATE_DATA is a reference to S3
    if (TEMPLATE_DATA.type === 's3Path' && TEMPLATE_DATA.path) {
      console.log(`TEMPLATE_DATA contains S3 path reference: ${TEMPLATE_DATA.path}`);
      
      // We'll load the actual data from S3 path in the main function
      if (TEMPLATE_DATA.segments && Array.isArray(TEMPLATE_DATA.segments)) {
        console.log(`TEMPLATE_DATA already contains ${TEMPLATE_DATA.segments.length} segments`);
      } else {
        console.log(`TEMPLATE_DATA is S3 reference, will load full data later`);
      }
    } else {
      console.log(`TEMPLATE_DATA parsed successfully, contains ${TEMPLATE_DATA.segments ? TEMPLATE_DATA.segments.length : 0} segments`);
    }
  } else if (process.env.TEMPLATE_DATA_PATH) {
    console.log(`Loading template data from S3 path: ${process.env.TEMPLATE_DATA_PATH}`);
    // Template-Daten werden später in der main-Funktion aus S3 geladen
  } else {
    console.warn('No TEMPLATE_DATA or TEMPLATE_DATA_PATH provided, some features may not work correctly');
  }
} catch (error) {
  console.error('Error parsing TEMPLATE_DATA:', error);
  console.error('First 100 characters of TEMPLATE_DATA:', process.env.TEMPLATE_DATA?.substring(0, 100));
  console.error('Job will continue but may fail later if template data is required');
}

/**
 * Formatiert Zeit in Sekunden in das SRT-Format: [Stunden]:[Minuten]:[Sekunden],[Millisekunden]
 */
function formatTime(timeInSeconds) {
  const hours = Math.floor(timeInSeconds / 3600);
  const minutes = Math.floor((timeInSeconds % 3600) / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  const milliseconds = Math.floor((timeInSeconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
}

/**
 * Erzeugt SRT-Untertitel aus dem gegebenen Text mit begrenzter Zeilenlänge
 * und synchronisiert sie mit Wort-Zeitstempeln, wenn verfügbar
 */
function generateSrtContent(subtitleText, options = {}) {
  console.log(`Generating subtitles for text (${subtitleText.length} chars)`);
  
  // Standardwerte für Optionen
  const maxCharsPerLine = options.maxCharsPerLine || 18;
  const wordTimestamps = options.wordTimestamps || null;
  const wordSplitThreshold = Math.round(maxCharsPerLine * 1.5);
  
  // Versuche, Wort-Zeitstempel zu verwenden, wenn verfügbar
  if (wordTimestamps && Array.isArray(wordTimestamps) && wordTimestamps.length > 0) {
    console.log(`Using ${wordTimestamps.length} word timestamps for accurate subtitle timing`);
    return generateSyncedSubtitles(subtitleText, wordTimestamps, maxCharsPerLine, wordSplitThreshold);
  }
  
  // Wenn keine Zeitstempel verfügbar sind, verwende die vereinfachte Methode
  console.log('No word timestamps available, using simplified fixed-duration subtitles');
  
  // Wir splitten den Text in Sätze
  const sentences = subtitleText.match(/[^\.!\?]+[\.!\?]+/g) || [subtitleText];
  
  let srtContent = '';
  let index = 1;
  let currentTime = 0;
  
  // Feste Einstellungen für die vereinfachte Methode
  const fixedDurationPerSubtitle = 2.5; // 2.5 Sekunden pro Untertitel
  
  for (const sentence of sentences) {
    // Entferne Whitespace
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    // Teile den Satz in kurze Phrasen auf, die in die Zeile passen
    const words = trimmedSentence.split(/\s+/);
    let currentLine = '';
    let phrases = [];
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      // Wenn das Wort alleine schon extrem lang ist, teile es auf
      if (word.length > wordSplitThreshold) {
        // Füge die aktuelle Zeile hinzu, falls vorhanden
        if (currentLine) {
          phrases.push(currentLine);
          currentLine = '';
        }
        
        // Teile das extrem lange Wort in Teilstücke
        let remainingWord = word;
        while (remainingWord.length > wordSplitThreshold) {
          const chunk = remainingWord.substring(0, wordSplitThreshold);
          phrases.push(chunk + '-');
          remainingWord = remainingWord.substring(wordSplitThreshold);
        }
        
        // Letzten Teil behalten für die nächste Zeile, wenn übrig
        if (remainingWord.length > 0) {
          currentLine = remainingWord;
        }
        continue;
      }
      
      // Teste, ob das aktuelle Wort noch in die Zeile passt
      const lineWithWord = currentLine ? `${currentLine} ${word}` : word;
      
      if (lineWithWord.length <= maxCharsPerLine) {
        // Wort passt in aktuelle Zeile
        currentLine = lineWithWord;
      } else {
        // Wort passt nicht mehr - speichere aktuelle Zeile und beginne neue
        if (currentLine) {
          phrases.push(currentLine);
        }
        currentLine = word;
      }
      
      // Wenn das letzte Wort, füge es noch hinzu
      if (i === words.length - 1 && currentLine) {
        phrases.push(currentLine);
      }
    }
    
    // Erstelle SRT-Einträge für jede Phrase mit fester Dauer
    for (let i = 0; i < phrases.length; i++) {
      const startTime = currentTime;
      const endTime = startTime + fixedDurationPerSubtitle;
      
      const startTimeFormatted = formatTime(startTime);
      const endTimeFormatted = formatTime(endTime);
      
      srtContent += `${index}\n${startTimeFormatted} --> ${endTimeFormatted}\n${phrases[i]}\n\n`;
      index++;
      currentTime = endTime; // Nächster Untertitel beginnt, wenn der aktuelle endet
    }
  }
  
  return srtContent;
}

/**
 * Generiert synchronisierte Untertitel mit ElevenLabs Wort-Zeitstempeln
 */
function generateSyncedSubtitles(subtitleText, wordTimestamps, maxCharsPerLine, wordSplitThreshold) {
  console.log(`Generating synced subtitles using ${wordTimestamps.length} word timestamps`);
  
  // Sammle alle Wörter aus den Zeitstempeln
  const words = wordTimestamps.map(ts => ({
    word: ts.word,
    startTime: ts.startTime,
    endTime: ts.endTime,
    duration: ts.endTime - ts.startTime
  }));
  
  // Gruppiere Wörter in Phrasen, die nicht länger als maxCharsPerLine sind
  let phrases = [];
  let currentPhrase = {
    text: '',
    startTime: words[0]?.startTime || 0,
    endTime: 0,
    words: []
  };
  
  // Durchlaufe alle Wörter und bilde Phrasen
  words.forEach(wordObj => {
    const { word, startTime, endTime } = wordObj;
    
    // Sehr lange Wörter müssen separat behandelt werden
    if (word.length > wordSplitThreshold) {
      // Wenn aktuelle Phrase nicht leer ist, speichern
      if (currentPhrase.text) {
        currentPhrase.endTime = wordObj.startTime; // Ende vor dem langen Wort
        phrases.push(currentPhrase);
      }
      
      // Teile das lange Wort in Teilstücke
      let remainingWord = word;
      let offset = 0;
      const wordDuration = endTime - startTime;
      const durationPerChar = wordDuration / word.length;
      
      while (remainingWord.length > 0) {
        const chunkLength = Math.min(remainingWord.length, wordSplitThreshold);
        const chunk = remainingWord.substring(0, chunkLength);
        const chunkStartTime = startTime + (offset * durationPerChar);
        const chunkEndTime = chunkStartTime + (chunkLength * durationPerChar);
        
        phrases.push({
          text: chunk + (remainingWord.length > chunkLength ? '-' : ''),
          startTime: chunkStartTime,
          endTime: chunkEndTime,
          words: [{ word: chunk, startTime: chunkStartTime, endTime: chunkEndTime }]
        });
        
        offset += chunkLength;
        remainingWord = remainingWord.substring(chunkLength);
      }
      
      // Beginne neue leere Phrase
      currentPhrase = {
        text: '',
        startTime: endTime,
        endTime: 0,
        words: []
      };
      return;
    }
    
    // Normaler Fall: Prüfe, ob das Wort in die aktuelle Zeile passt
    const potentialText = currentPhrase.text 
      ? `${currentPhrase.text} ${word}`
      : word;
    
    if (potentialText.length <= maxCharsPerLine) {
      // Wort passt in aktuelle Phrase
      currentPhrase.text = potentialText;
      currentPhrase.endTime = endTime;
      currentPhrase.words.push(wordObj);
    } else {
      // Wort passt nicht mehr, speichere aktuelle Phrase und beginne neue
      if (currentPhrase.text) {
        phrases.push(currentPhrase);
      }
      
      // Beginne neue Phrase mit aktuellem Wort
      currentPhrase = {
        text: word,
        startTime: startTime,
        endTime: endTime,
        words: [wordObj]
      };
    }
  });
  
  // Füge letzte Phrase hinzu, wenn noch vorhanden
  if (currentPhrase.text) {
    phrases.push(currentPhrase);
  }
  
  // Formatiere Phrasen als SRT
  let srtContent = '';
  phrases.forEach((phrase, index) => {
    // Mindestanzeigedauer für sehr kurze Phrasen (1 Sekunde)
    if (phrase.endTime - phrase.startTime < 1.0) {
      phrase.endTime = phrase.startTime + 1.0;
    }
    
    // Formatierte Zeitangaben
    const startTimeFormatted = formatTime(phrase.startTime);
    const endTimeFormatted = formatTime(phrase.endTime);
    
    // SRT-Eintrag hinzufügen
    srtContent += `${index + 1}\n${startTimeFormatted} --> ${endTimeFormatted}\n${phrase.text}\n\n`;
  });
  
  console.log(`Created ${phrases.length} synchronized subtitle entries`);
  return srtContent;
}

/**
 * Hauptfunktion für die Videoverarbeitung
 */
async function main() {
  console.log('Starting video processing job', JOB_TYPE, 'for user', USER_ID);
  console.log('Job ID:', AWS_BATCH_JOB_ID);
  console.log('Project ID:', PROJECT_ID);
  console.log('Input video URL:', INPUT_VIDEO_URL);
  console.log('Output key:', OUTPUT_KEY);
  console.log('S3 bucket:', S3_BUCKET);
  
  try {
    // Validiere, dass alle erforderlichen Umgebungsvariablen vorhanden sind
    if (!INPUT_VIDEO_URL) {
      throw new Error('INPUT_VIDEO_URL environment variable is required');
    }
    
    if (!S3_BUCKET) {
      throw new Error('S3_BUCKET or S3_BUCKET_NAME environment variable is required');
    }
    
    if (!OUTPUT_KEY) {
      throw new Error('OUTPUT_KEY environment variable is required');
    }
    
    // Erstelle temporäre Verzeichnisse
    await createDirectories();
    
    // Lade Template-Daten aus S3, wenn ein Pfad angegeben ist
    const templateDataPath = process.env.TEMPLATE_DATA_PATH || (TEMPLATE_DATA?.type === 's3Path' ? TEMPLATE_DATA.path : null);
    
    if (templateDataPath && (!TEMPLATE_DATA || !TEMPLATE_DATA.segments || !Array.isArray(TEMPLATE_DATA.segments))) {
      try {
        console.log(`Loading template data from S3 path: ${templateDataPath}`);
        
        // Lade die Template-Daten aus S3
        const tempDataPath = `${TEMP_DIR}/template-data.json`;
        await downloadFromS3(templateDataPath, tempDataPath);
        
        // Lese und parse die JSON-Datei
        const templateDataStr = fs.readFileSync(tempDataPath, 'utf8');
        TEMPLATE_DATA = JSON.parse(templateDataStr);
        
        console.log(`Template data loaded from S3 successfully, contains ${TEMPLATE_DATA.segments ? TEMPLATE_DATA.segments.length : 0} segments`);
      } catch (error) {
        console.error('Error loading template data from S3:', error);
        console.log('Continuing with existing TEMPLATE_DATA from environment variable if available');
        
        // Only throw if we have no template data at all
        if (!TEMPLATE_DATA || !TEMPLATE_DATA.segments || !Array.isArray(TEMPLATE_DATA.segments)) {
          throw new Error(`Failed to load template data from S3 and no valid template data in environment: ${error.message}`);
        }
      }
    } else if (TEMPLATE_DATA && TEMPLATE_DATA.segments && Array.isArray(TEMPLATE_DATA.segments)) {
      console.log(`Using TEMPLATE_DATA from environment variable, contains ${TEMPLATE_DATA.segments.length} segments`);
    }
    
    // Validiere Template-Daten für generate-final
    if (JOB_TYPE === 'generate-final') {
      if (!TEMPLATE_DATA) {
        throw new Error('TEMPLATE_DATA or TEMPLATE_DATA_PATH is required for generate-final job type');
      }
      
      if (!TEMPLATE_DATA.segments || !Array.isArray(TEMPLATE_DATA.segments) || TEMPLATE_DATA.segments.length === 0) {
        throw new Error('No video segments provided in TEMPLATE_DATA');
      }
    }
    
    // Verarbeite Video je nach Job-Typ
    let outputFilePath;
    
    if (JOB_TYPE === 'generate-final') {
      console.log('Starting generate-final job');
      outputFilePath = await generateFinalVideo();
    } else {
      throw new Error(`Unsupported job type: ${JOB_TYPE}`);
    }
    
    // Lade das verarbeitete Video zu S3 hoch
    await uploadOutputFile(outputFilePath);
    
    // Sende Callback für erfolgreichen Job
    await sendCallback({
      status: 'success',
      outputKey: OUTPUT_KEY,
      projectId: PROJECT_ID
    });
    
    console.log('Video processing completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error processing video:', error);
    console.error('Stack trace:', error.stack);
    
    // Sende Callback für fehlgeschlagenen Job
    try {
      await sendCallback({
        status: 'failed',
        error: error.message,
        projectId: PROJECT_ID
      });
    } catch (callbackError) {
      console.error('Failed to send error callback:', callbackError);
    }
    
    process.exit(1);
  } finally {
    // Aufräumen - temporäre Dateien löschen
    try {
      await cleanupTempFiles();
    } catch (cleanupError) {
      console.error('Failed to clean up temporary files:', cleanupError);
    }
  }
}

/**
 * Erstelle temporäre Verzeichnisse für die Verarbeitung
 */
async function createDirectories() {
  console.log('Creating temporary directories');
  for (const dir of [TEMP_DIR, INPUT_DIR, OUTPUT_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    } else {
      console.log(`Directory already exists: ${dir}`);
    }
  }
}

/**
 * Generiere ein komplettes Video mit allen Schritten
 */
async function generateFinalVideo() {
  console.log('Starting final video generation');
  
  if (!TEMPLATE_DATA) {
    throw new Error('TEMPLATE_DATA is required for generate-final job type');
  }
  
  if (!TEMPLATE_DATA.segments || !Array.isArray(TEMPLATE_DATA.segments) || TEMPLATE_DATA.segments.length === 0) {
    throw new Error('No video segments provided in TEMPLATE_DATA');
  }
  
  console.log(`Processing ${TEMPLATE_DATA.segments.length} video segments`);
  
  // 1. Lade die Segmente herunter
  const segmentFiles = [];
  for (let i = 0; i < TEMPLATE_DATA.segments.length; i++) {
    const segment = TEMPLATE_DATA.segments[i];
    console.log(`Processing segment ${i+1}/${TEMPLATE_DATA.segments.length}: ${segment.url}`);
    
    if (!segment.url) {
      throw new Error(`Segment ${i} has no URL`);
    }
    
    // Extrahiere den Dateinamen aus der URL
    const urlParts = segment.url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const localPath = path.join(INPUT_DIR, `segment_${i}_${fileName}`);
    
    // Lade die Datei herunter
    console.log(`Downloading segment from ${segment.url} to ${localPath}`);
    try {
      await downloadFromUrl(segment.url, localPath);
      console.log(`Successfully downloaded segment ${i+1}`);
      
      // Verify the file exists and has content
      if (!fs.existsSync(localPath) || fs.statSync(localPath).size === 0) {
        throw new Error(`Downloaded segment file is empty or does not exist: ${localPath}`);
      }
      
      segmentFiles.push({
        file: localPath,
        startTime: segment.startTime || 0,
        duration: segment.duration || 10,
        position: segment.position || i
      });
    } catch (error) {
      console.error(`Error downloading segment ${i+1}:`, error.message);
      throw new Error(`Failed to download segment ${i+1}: ${error.message}`);
    }
  }
  
  // 2. Trimme jedes Segment
  console.log('Trimming segments...');
  const trimPromises = [];
  const trimmedFiles = [];
  
  for (let i = 0; i < segmentFiles.length; i++) {
    const segment = segmentFiles[i];
    const outputFile = path.join(OUTPUT_DIR, `trimmed_${i}.mp4`);
    
    console.log(`Preparing to trim segment ${i+1}/${segmentFiles.length}: startTime=${segment.startTime}, duration=${segment.duration}`);
    
    // FFmpeg-Befehl zum Trimmen eines Segments
    const args = [
      '-ss', segment.startTime.toString(), // Seek vor dem Input für schnelleres Trimmen
      '-i', segment.file,
      '-t', segment.duration.toString(),
      '-c:v', 'libx264', 
      '-preset', 'veryfast', // Schneller Preset für bessere Geschwindigkeit
      '-crf', '23', // Bessere Qualität (niedrigerer Wert = höhere Qualität)
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-y',
      outputFile
    ];
    
    // Erstelle ein Promise für jede Trimming-Operation
    const trimPromise = (async () => {
      try {
        await runFFmpeg(args);
        console.log(`Successfully trimmed segment ${i+1}`);
        
        // Verify the trimmed file exists and has content
        if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size === 0) {
          throw new Error(`Trimmed file is empty or does not exist: ${outputFile}`);
        }
        
        return {
          file: outputFile,
          position: segment.position
        };
      } catch (error) {
        console.error(`Error trimming segment ${i+1}:`, error.message);
        throw new Error(`Failed to trim segment ${i+1}: ${error.message}`);
      }
    })();
    
    trimPromises.push(trimPromise);
  }
  
  // Warte auf alle Trimming-Operationen
  try {
    console.log(`Waiting for ${trimPromises.length} trim operations to complete...`);
    const results = await Promise.all(trimPromises);
    trimmedFiles.push(...results);
    console.log(`All ${trimmedFiles.length} segments trimmed successfully`);
  } catch (error) {
    console.error('Error during parallel trimming:', error.message);
    throw error;
  }
  
  // 3. Sortiere Segmente nach Position
  trimmedFiles.sort((a, b) => a.position - b.position);
  console.log('Segments sorted by position');
  
  // 4. Erstelle temporäre Dateiliste für Verkettung
  const concatFile = path.join(TEMP_DIR, 'concat.txt');
  const fileContents = trimmedFiles.map(item => 
    `file '${item.file.replace(/'/g, "'\\''")}'`
  ).join('\n');
  
  fs.writeFileSync(concatFile, fileContents);
  console.log(`Created concat file with ${trimmedFiles.length} segments`);
  console.log(`Concat file contents:\n${fileContents}`);
  
  const concatenatedFile = path.join(OUTPUT_DIR, 'concatenated.mp4');
  
  // 5. Verkette die Segmente
  console.log('Concatenating trimmed segments...');
  try {
    await runFFmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFile,
      '-c:v', 'libx264',
      '-preset', 'veryfast', // Schneller Preset für bessere Geschwindigkeit
      '-crf', '23', // Bessere Qualität (niedrigerer Wert = höhere Qualität)
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-maxrate', '5M', // Maximale Bitrate für bessere Qualität
      '-bufsize', '10M', // Buffer-Größe für konstante Qualität
      '-profile:v', 'high', // High-Profile für bessere Kompression
      '-level', '4.1', // Kompatibilitätslevel
      '-y',
      concatenatedFile
    ]);
    console.log('Successfully concatenated segments');
    
    // Verify the concatenated file exists and has content
    if (!fs.existsSync(concatenatedFile) || fs.statSync(concatenatedFile).size === 0) {
      throw new Error(`Concatenated file is empty or does not exist: ${concatenatedFile}`);
    }
  } catch (error) {
    console.error('Error concatenating segments:', error.message);
    throw new Error(`Failed to concatenate segments: ${error.message}`);
  }
  
  // 6. Wenn ein Voiceover vorhanden ist, füge es hinzu
  const VOICEOVER_URL = process.env.VOICEOVER_URL || '';
  const VOICEOVER_KEY = process.env.VOICEOVER_KEY || '';
  const VOICEOVER_ID = process.env.VOICEOVER_ID || (TEMPLATE_DATA && TEMPLATE_DATA.voiceoverId) || '';
  
  console.log('DEBUG VOICEOVER CHECK:');
  console.log('- VOICEOVER_URL:', VOICEOVER_URL);
  console.log('- VOICEOVER_KEY:', VOICEOVER_KEY);
  console.log('- VOICEOVER_ID:', VOICEOVER_ID);
  console.log('- TEMPLATE_DATA.voiceoverId:', TEMPLATE_DATA && TEMPLATE_DATA.voiceoverId ? TEMPLATE_DATA.voiceoverId : 'not set');
  
  // Überprüfen aller Möglichkeiten für ein Voiceover
  if (VOICEOVER_URL || VOICEOVER_KEY || VOICEOVER_ID || (TEMPLATE_DATA && TEMPLATE_DATA.voiceoverId)) {
    console.log(`Voiceover information found`);
    if (TEMPLATE_DATA && TEMPLATE_DATA.voiceoverId) {
      console.log(`Voiceover ID from template: ${TEMPLATE_DATA.voiceoverId}`);
    }
    if (VOICEOVER_ID) {
      console.log(`Voiceover ID from env: ${VOICEOVER_ID}`);
    }
    if (VOICEOVER_URL) {
      console.log(`Direct Voiceover URL provided: ${VOICEOVER_URL}`);
    }
    if (VOICEOVER_KEY) {
      console.log(`Voiceover Key provided: ${VOICEOVER_KEY}`);
    }
    
    try {
      // Lade die Voiceover-Datei von S3 herunter
      const voiceoverPath = path.join(INPUT_DIR, `voiceover.mp3`);
      let voiceoverExists = false;
      let voiceoverSource = '';
      
      // Prüfe zuerst, ob eine direkte URL angegeben wurde
      if (VOICEOVER_URL) {
        try {
          console.log(`Downloading voiceover from direct URL: ${VOICEOVER_URL}`);
          const response = await fetch(VOICEOVER_URL);
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(voiceoverPath, buffer);
            
            // Verify file was written
            const fileSize = fs.statSync(voiceoverPath).size;
            console.log(`Voiceover file written with size: ${fileSize} bytes`);
            
            if (fileSize > 0) {
              voiceoverExists = true;
              voiceoverSource = 'direct URL';
              console.log(`Successfully downloaded voiceover from URL to ${voiceoverPath}`);
            } else {
              console.error(`Downloaded voiceover file is empty`);
            }
          } else {
            console.error(`Failed to download voiceover from URL: ${response.status} ${response.statusText}`);
          }
        } catch (error) {
          console.error(`Error downloading voiceover from URL: ${error.message}`);
        }
      }
      
      // Wenn keine direkte URL erfolgreich war, versuche es mit dem Key
      if (!voiceoverExists && VOICEOVER_KEY) {
        try {
          console.log(`Downloading voiceover from key: ${VOICEOVER_KEY}`);
          await downloadFromS3(VOICEOVER_KEY, voiceoverPath);
          
          // Verify the download
          const fileSize = fs.statSync(voiceoverPath).size;
          console.log(`Voiceover file downloaded with size: ${fileSize} bytes`);
          
          if (fileSize > 0) {
            voiceoverExists = true;
            voiceoverSource = `S3 key: ${VOICEOVER_KEY}`;
            console.log(`Successfully downloaded voiceover from S3 key to ${voiceoverPath}`);
          } else {
            console.error(`Downloaded voiceover file from key is empty`);
          }
        } catch (error) {
          console.error(`Error downloading voiceover from key: ${error.message}`);
        }
      }
      
      // Wenn weder URL noch Key erfolgreich waren, versuche es mit der ID
      if (!voiceoverExists && TEMPLATE_DATA.voiceoverId) {
        // Versuche verschiedene mögliche Pfade für die Voiceover-Datei
        const possiblePaths = [
          `audio/${TEMPLATE_DATA.voiceoverId}.mp3`,
          `audio/voiceover_${TEMPLATE_DATA.voiceoverId}.mp3`,
          `audio/${TEMPLATE_DATA.voiceoverId}`,
          `voiceovers/${TEMPLATE_DATA.voiceoverId}.mp3`,
          `voiceovers/voiceover_${TEMPLATE_DATA.voiceoverId}.mp3`
        ];
        
        // Check if voiceover file exists in S3 before attempting to download
        let existingVoiceoverKey = '';
        
        for (const voiceoverKey of possiblePaths) {
          try {
            console.log(`Checking if voiceover exists in S3: ${S3_BUCKET}/${voiceoverKey}`);
            await s3Client.send(new HeadObjectCommand({
              Bucket: S3_BUCKET,
              Key: voiceoverKey
            }));
            voiceoverExists = true;
            existingVoiceoverKey = voiceoverKey;
            voiceoverSource = `S3 path: ${voiceoverKey}`;
            console.log(`Voiceover file found in S3: ${voiceoverKey}`);
            break;
          } catch (error) {
            console.log(`Voiceover not found at ${voiceoverKey}`);
          }
        }
        
        if (existingVoiceoverKey) {
          // Download the voiceover file
          try {
            console.log(`Downloading voiceover from S3: ${existingVoiceoverKey}`);
            await downloadFromS3(existingVoiceoverKey, voiceoverPath);
            console.log(`Successfully downloaded voiceover to ${voiceoverPath}`);
          } catch (error) {
            console.error(`Error downloading voiceover: ${error.message}`);
            voiceoverExists = false;
          }
        }
      }
      
      // Zusätzliche Prüfung für VOICEOVER_ID aus der Umgebungsvariable
      if (!voiceoverExists && VOICEOVER_ID && VOICEOVER_ID !== TEMPLATE_DATA.voiceoverId) {
        console.log(`Trying additional paths with VOICEOVER_ID from environment: ${VOICEOVER_ID}`);
        
        // Versuche verschiedene mögliche Pfade für die Voiceover-Datei
        const possiblePaths = [
          `audio/${VOICEOVER_ID}.mp3`,
          `audio/voiceover_${VOICEOVER_ID}.mp3`,
          `audio/${VOICEOVER_ID}`,
          `voiceovers/${VOICEOVER_ID}.mp3`,
          `voiceovers/voiceover_${VOICEOVER_ID}.mp3`,
          `uploads/${VOICEOVER_ID}.mp3`,
          `uploads/voiceover_${VOICEOVER_ID}.mp3`,
          `uploads/${VOICEOVER_ID}`
        ];
        
        // Check if voiceover file exists in S3 before attempting to download
        let existingVoiceoverKey = '';
        
        for (const voiceoverKey of possiblePaths) {
          try {
            console.log(`Checking if voiceover exists in S3: ${S3_BUCKET}/${voiceoverKey}`);
            await s3Client.send(new HeadObjectCommand({
              Bucket: S3_BUCKET,
              Key: voiceoverKey
            }));
            voiceoverExists = true;
            existingVoiceoverKey = voiceoverKey;
            voiceoverSource = `S3 path: ${voiceoverKey}`;
            console.log(`Voiceover file found in S3: ${voiceoverKey}`);
            break;
          } catch (error) {
            console.log(`Voiceover not found at ${voiceoverKey}`);
          }
        }
        
        if (existingVoiceoverKey) {
          // Download the voiceover file
          try {
            console.log(`Downloading voiceover from S3: ${existingVoiceoverKey}`);
            await downloadFromS3(existingVoiceoverKey, voiceoverPath);
            console.log(`Successfully downloaded voiceover to ${voiceoverPath}`);
          } catch (error) {
            console.error(`Error downloading voiceover: ${error.message}`);
            voiceoverExists = false;
          }
        }
      }
      
      if (!voiceoverExists) {
        console.warn(`Could not find or download voiceover file`);
        console.log('Continuing without voiceover');
        return concatenatedFile;
      }
      
      // Verify the voiceover file exists and has content
      if (!fs.existsSync(voiceoverPath) || fs.statSync(voiceoverPath).size === 0) {
        throw new Error(`Downloaded voiceover file is empty or does not exist: ${voiceoverPath}`);
      }
      
      console.log(`Using voiceover from ${voiceoverSource}`);
      
      const finalFile = path.join(OUTPUT_DIR, 'final.mp4');
      
      // FFmpeg-Befehl zum Hinzufügen des Voiceovers
      console.log('Adding voiceover to video...');
      try {
        await runFFmpeg([
          '-i', concatenatedFile,
          '-i', voiceoverPath,
          '-map', '0:v', // Video vom ersten Input
          '-map', '1:a', // Audio vom zweiten Input
          '-c:v', 'libx264',
          '-preset', 'veryfast', // Schneller Preset für bessere Geschwindigkeit
          '-crf', '23', // Bessere Qualität (niedrigerer Wert = höhere Qualität)
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-shortest',
          '-y',
          finalFile
        ]);
        
        console.log('Successfully added voiceover to video');
        
        // Verify the final file exists and has content
        if (!fs.existsSync(finalFile) || fs.statSync(finalFile).size === 0) {
          throw new Error(`Final file with voiceover is empty or does not exist: ${finalFile}`);
        }
        
        // 7. Wenn Untertitel erwünscht sind und ein Text vorhanden ist, füge sie hinzu
        if (ADD_SUBTITLES && (SUBTITLE_TEXT || TEMPLATE_DATA.voiceoverText)) {
          console.log('Adding subtitles to video...');
          
          // Nutze entweder den übergebenen Text oder den aus TEMPLATE_DATA
          const subtitleText = SUBTITLE_TEXT || TEMPLATE_DATA.voiceoverText;
          
          if (!subtitleText) {
            console.warn('No subtitle text available, skipping subtitles');
            return finalFile;
          }
          
          // Hole die Untertitel-Styling-Optionen
          let fontName = SUBTITLE_FONT_NAME;
          let fontSize = SUBTITLE_FONT_SIZE;
          let primaryColor = SUBTITLE_PRIMARY_COLOR;
          let backgroundColor = SUBTITLE_BACKGROUND_COLOR;
          let borderStyle = parseInt(SUBTITLE_BORDER_STYLE);
          let position = SUBTITLE_POSITION;
          
          // Verwende Optionen aus TEMPLATE_DATA, wenn verfügbar
          if (TEMPLATE_DATA.subtitleOptions) {
            console.log('Using custom subtitle options from TEMPLATE_DATA');
            fontName = TEMPLATE_DATA.subtitleOptions.fontName || fontName;
            fontSize = TEMPLATE_DATA.subtitleOptions.fontSize || fontSize;
            primaryColor = TEMPLATE_DATA.subtitleOptions.primaryColor || primaryColor;
            backgroundColor = TEMPLATE_DATA.subtitleOptions.backgroundColor || backgroundColor;
            borderStyle = TEMPLATE_DATA.subtitleOptions.borderStyle || borderStyle;
            position = TEMPLATE_DATA.subtitleOptions.position || position;
          }
          
          // Konvertiere primäre Farbe in FFmpeg-Format (entferne #)
          const primaryColorFFmpeg = primaryColor.replace('#', '&H00');
          
          // Konvertiere Hintergrundfarbe in FFmpeg-Format (entferne #)
          const backgroundColorFFmpeg = backgroundColor.replace('#', '&H');
          
          console.log(`Using subtitle styling - Font: ${fontName}, Size: ${fontSize}, Color: ${primaryColorFFmpeg}, 
            BG: ${backgroundColorFFmpeg}, Border: ${borderStyle}, Position: ${position}`);
          
          // Erstelle temporäre SRT-Datei
          const srtFile = path.join(TEMP_DIR, 'subtitles.srt');
          
          try {
            // Prüfe, ob wir Wort-Zeitstempel für die Synchronisation haben
            let wordTimestamps = null;
            
            if (process.env.WORD_TIMESTAMPS) {
              // Detaillierte Debug-Informationen
              const timestampEnvSize = process.env.WORD_TIMESTAMPS.length;
              console.log(`WORD_TIMESTAMPS environment variable found with size: ${timestampEnvSize} characters`);
              
              // Ausgabe einer Beispielprobe der Daten
              const sampleData = process.env.WORD_TIMESTAMPS.substring(0, Math.min(200, timestampEnvSize)) + (timestampEnvSize > 200 ? '...' : '');
              console.log(`WORD_TIMESTAMPS sample: ${sampleData}`);
              
              try {
                console.log('Attempting to parse WORD_TIMESTAMPS JSON data');
                wordTimestamps = JSON.parse(process.env.WORD_TIMESTAMPS);
                
                if (Array.isArray(wordTimestamps)) {
                  console.log(`Successfully parsed ${wordTimestamps.length} word timestamps for subtitle synchronization`);
                  
                  // Validiere die Timestamp-Struktur - haben wir word, startTime und endTime?
                  let isValid = true;
                  if (wordTimestamps.length > 0) {
                    const firstTimestamp = wordTimestamps[0];
                    if (!firstTimestamp.word || 
                        typeof firstTimestamp.startTime !== 'number' || 
                        typeof firstTimestamp.endTime !== 'number') {
                      console.error('Invalid timestamp structure. Expected: {word, startTime, endTime}');
                      console.error('Got:', JSON.stringify(firstTimestamp));
                      isValid = false;
                    }
                  }
                  
                  if (isValid) {
                    // Ausgabe einiger Beispiel-Timestamps
                    if (wordTimestamps.length > 0) {
                      console.log('First 3 timestamps:');
                      wordTimestamps.slice(0, Math.min(3, wordTimestamps.length)).forEach((ts, i) => {
                        console.log(`  ${i+1}: "${ts.word}" - ${ts.startTime}s to ${ts.endTime}s (duration: ${ts.endTime - ts.startTime}s)`);
                      });
                    }
                  } else {
                    // Struktur ungültig - zurücksetzen
                    console.warn('Invalid timestamp structure detected - reverting to character-based timing');
                    wordTimestamps = null;
                  }
                } else {
                  console.error('Parsed WORD_TIMESTAMPS is not an array!', typeof wordTimestamps);
                  wordTimestamps = null;
                }
              } catch (timestampError) {
                console.error('Error parsing word timestamps:', timestampError);
                console.log('Will use fallback timing based on character count');
                wordTimestamps = null;
              }
            } else {
              console.log('No word timestamps provided, using character-based timing');
            }
            
            // Generiere SRT-Inhalt mit unserer Helper-Funktion
            const srtContent = generateSrtContent(subtitleText, {
              maxCharsPerLine: 18,
              charsPerSecond: 10,
              wordTimestamps: wordTimestamps
            });
            
            // Schreibe SRT-Datei
            fs.writeFileSync(srtFile, srtContent);
            console.log(`Created SRT file for subtitles`);
            
            // Setze Positionsparameter je nach gewählter Position
            let positionParam = '';
            if (position === 'top') {
              positionParam = ',MarginV=60';
            } else if (position === 'middle') {
              positionParam = ',MarginV=30';
            }
            
            // Erstelle neues Video mit Untertiteln
            const subtitledFile = path.join(OUTPUT_DIR, 'final_with_subtitles.mp4');
            
            const forceStyleParam = `subtitles=${srtFile.replace(/\\/g, '/')}:force_style='FontName=${fontName},FontSize=${fontSize},PrimaryColour=${primaryColorFFmpeg},BackColour=${backgroundColorFFmpeg},BorderStyle=${borderStyle}${positionParam}'`;
            
            console.log(`Using FFmpeg subtitle filter: ${forceStyleParam}`);
            
            await runFFmpeg([
              '-i', finalFile,
              '-vf', forceStyleParam,
              '-c:a', 'copy',
              '-y',
              subtitledFile
            ]);
            
            console.log('Successfully added subtitles to video');
            
            // Verify the subtitled file exists and has content
            if (!fs.existsSync(subtitledFile) || fs.statSync(subtitledFile).size === 0) {
              throw new Error(`Final file with subtitles is empty or does not exist: ${subtitledFile}`);
            }
            
            return subtitledFile;
          } catch (subtitleError) {
            console.error(`Error adding subtitles: ${subtitleError.message}`);
            console.log('Continuing with video without subtitles');
            return finalFile;
          }
        }
        
        return finalFile;
      } catch (error) {
        console.error(`Error adding voiceover to video: ${error.message}`);
        console.log('Continuing with concatenated video without voiceover');
        return concatenatedFile;
      }
    } catch (voiceoverError) {
      console.error(`Error processing voiceover: ${voiceoverError.message}`);
      console.log('Continuing without voiceover due to error');
      return concatenatedFile;
    }
  }
  
  // 7. Wenn Untertitel erwünscht sind, aber kein Voiceover vorhanden ist
  if (ADD_SUBTITLES && (SUBTITLE_TEXT || TEMPLATE_DATA.voiceoverText)) {
    console.log('Adding subtitles to concatenated video (no voiceover)...');
    
    // Nutze entweder den übergebenen Text oder den aus TEMPLATE_DATA
    const subtitleText = SUBTITLE_TEXT || TEMPLATE_DATA.voiceoverText;
    
    if (!subtitleText) {
      console.warn('No subtitle text available, skipping subtitles');
      return concatenatedFile;
    }
    
    // Hole die Untertitel-Styling-Optionen
    let fontName = SUBTITLE_FONT_NAME;
    let fontSize = SUBTITLE_FONT_SIZE;
    let primaryColor = SUBTITLE_PRIMARY_COLOR;
    let backgroundColor = SUBTITLE_BACKGROUND_COLOR;
    let borderStyle = parseInt(SUBTITLE_BORDER_STYLE);
    let position = SUBTITLE_POSITION;
    
    // Verwende Optionen aus TEMPLATE_DATA, wenn verfügbar
    if (TEMPLATE_DATA.subtitleOptions) {
      console.log('Using custom subtitle options from TEMPLATE_DATA');
      fontName = TEMPLATE_DATA.subtitleOptions.fontName || fontName;
      fontSize = TEMPLATE_DATA.subtitleOptions.fontSize || fontSize;
      primaryColor = TEMPLATE_DATA.subtitleOptions.primaryColor || primaryColor;
      backgroundColor = TEMPLATE_DATA.subtitleOptions.backgroundColor || backgroundColor;
      borderStyle = TEMPLATE_DATA.subtitleOptions.borderStyle || borderStyle;
      position = TEMPLATE_DATA.subtitleOptions.position || position;
    }
    
    // Konvertiere primäre Farbe in FFmpeg-Format (entferne #)
    const primaryColorFFmpeg = primaryColor.replace('#', '&H00');
    
    // Konvertiere Hintergrundfarbe in FFmpeg-Format (entferne #)
    const backgroundColorFFmpeg = backgroundColor.replace('#', '&H');
    
    console.log(`Using subtitle styling - Font: ${fontName}, Size: ${fontSize}, Color: ${primaryColorFFmpeg}, 
      BG: ${backgroundColorFFmpeg}, Border: ${borderStyle}, Position: ${position}`);
    
    // Erstelle temporäre SRT-Datei
    const srtFile = path.join(TEMP_DIR, 'subtitles.srt');
    
    try {
      // Prüfe, ob wir Wort-Zeitstempel für die Synchronisation haben
      let wordTimestamps = null;
      
      if (process.env.WORD_TIMESTAMPS) {
        // Detaillierte Debug-Informationen
        const timestampEnvSize = process.env.WORD_TIMESTAMPS.length;
        console.log(`WORD_TIMESTAMPS environment variable found with size: ${timestampEnvSize} characters`);
        
        // Ausgabe einer Beispielprobe der Daten
        const sampleData = process.env.WORD_TIMESTAMPS.substring(0, Math.min(200, timestampEnvSize)) + (timestampEnvSize > 200 ? '...' : '');
        console.log(`WORD_TIMESTAMPS sample: ${sampleData}`);
        
        try {
          console.log('Attempting to parse WORD_TIMESTAMPS JSON data');
          wordTimestamps = JSON.parse(process.env.WORD_TIMESTAMPS);
          
          if (Array.isArray(wordTimestamps)) {
            console.log(`Successfully parsed ${wordTimestamps.length} word timestamps for subtitle synchronization`);
            
            // Validiere die Timestamp-Struktur - haben wir word, startTime und endTime?
            let isValid = true;
            if (wordTimestamps.length > 0) {
              const firstTimestamp = wordTimestamps[0];
              if (!firstTimestamp.word || 
                  typeof firstTimestamp.startTime !== 'number' || 
                  typeof firstTimestamp.endTime !== 'number') {
                console.error('Invalid timestamp structure. Expected: {word, startTime, endTime}');
                console.error('Got:', JSON.stringify(firstTimestamp));
                isValid = false;
              }
            }
            
            if (isValid) {
              // Ausgabe einiger Beispiel-Timestamps
              if (wordTimestamps.length > 0) {
                console.log('First 3 timestamps:');
                wordTimestamps.slice(0, Math.min(3, wordTimestamps.length)).forEach((ts, i) => {
                  console.log(`  ${i+1}: "${ts.word}" - ${ts.startTime}s to ${ts.endTime}s (duration: ${ts.endTime - ts.startTime}s)`);
                });
              }
            } else {
              // Struktur ungültig - zurücksetzen
              console.warn('Invalid timestamp structure detected - reverting to character-based timing');
              wordTimestamps = null;
            }
          } else {
            console.error('Parsed WORD_TIMESTAMPS is not an array!', typeof wordTimestamps);
            wordTimestamps = null;
          }
        } catch (timestampError) {
          console.error('Error parsing word timestamps:', timestampError);
          console.log('Will use fallback timing based on character count');
          wordTimestamps = null;
        }
      } else {
        console.log('No word timestamps provided, using character-based timing');
      }
      
      // Generiere SRT-Inhalt mit unserer Helper-Funktion
      const srtContent = generateSrtContent(subtitleText, {
        maxCharsPerLine: 18,
        charsPerSecond: 10,
        wordTimestamps: wordTimestamps
      });
      
      // Schreibe SRT-Datei
      fs.writeFileSync(srtFile, srtContent);
      console.log(`Created SRT file for subtitles`);
      
      // Erstelle neues Video mit Untertiteln
      const subtitledFile = path.join(OUTPUT_DIR, 'final_with_subtitles.mp4');
      
      const forceStyleParam = `subtitles=${srtFile.replace(/\\/g, '/')}:force_style='FontName=${fontName},FontSize=${fontSize},PrimaryColour=${primaryColorFFmpeg},BackColour=${backgroundColorFFmpeg},BorderStyle=${borderStyle}${positionParam}'`;
      
      console.log(`Using FFmpeg subtitle filter: ${forceStyleParam}`);
      
      await runFFmpeg([
        '-i', concatenatedFile,
        '-vf', forceStyleParam,
        '-c:a', 'copy',
        '-y',
        subtitledFile
      ]);
      
      console.log('Successfully added subtitles to video');
      
      // Verify the subtitled file exists and has content
      if (!fs.existsSync(subtitledFile) || fs.statSync(subtitledFile).size === 0) {
        throw new Error(`Final file with subtitles is empty or does not exist: ${subtitledFile}`);
      }
      
      return subtitledFile;
    } catch (subtitleError) {
      console.error(`Error adding subtitles: ${subtitleError.message}`);
      console.log('Continuing with video without subtitles');
      return concatenatedFile;
    }
  }
  
  return concatenatedFile;
}

/**
 * Führe einen FFmpeg-Befehl aus
 */
async function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    console.log(`Running FFmpeg with args: ${args.join(' ')}`);
    
    const ffmpeg = spawn('ffmpeg', args);
    let output = '';
    
    ffmpeg.stdout.on('data', (data) => {
      const message = data.toString();
      output += message;
      if (DEBUG) console.log(`FFmpeg stdout: ${message}`);
    });
    
    ffmpeg.stderr.on('data', (data) => {
      // FFmpeg schreibt den meisten Output auf stderr, auch wenn kein Fehler vorliegt
      const message = data.toString();
      console.log(message);
      output += message;
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log('FFmpeg command completed successfully');
        resolve();
      } else {
        console.error(`FFmpeg exited with code ${code}`);
        reject(new Error(`FFmpeg exited with code ${code}: ${output}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      console.error(`Failed to start FFmpeg: ${err.message}`);
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Lade das verarbeitete Video zu S3 hoch
 */
async function uploadOutputFile(filePath) {
  console.log(`Uploading output file ${filePath} to S3 bucket ${S3_BUCKET} with key ${OUTPUT_KEY}`);
  
  try {
    // Verify the file exists and has content
    if (!fs.existsSync(filePath)) {
      throw new Error(`Output file does not exist: ${filePath}`);
    }
    
    const fileStats = fs.statSync(filePath);
    if (fileStats.size === 0) {
      throw new Error(`Output file is empty: ${filePath}`);
    }
    
    console.log(`Output file size: ${fileStats.size} bytes`);
    
    const fileContent = fs.readFileSync(filePath);
    
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: OUTPUT_KEY,
      Body: fileContent,
      ContentType: 'video/mp4'
    });
    
    await s3Client.send(command);
    console.log(`Successfully uploaded output file to S3: s3://${S3_BUCKET}/${OUTPUT_KEY}`);
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw error;
  }
}

/**
 * Sende einen Callback an die Anwendung
 */
async function sendCallback(data) {
  if (!BATCH_CALLBACK_SECRET) {
    console.log('BATCH_CALLBACK_SECRET not provided, skipping callback');
    return;
  }
  
  if (!AWS_BATCH_JOB_ID) {
    console.log('AWS_BATCH_JOB_ID not provided, skipping callback');
    return;
  }
  
  const callbackData = {
    ...data,
    jobId: AWS_BATCH_JOB_ID,
    projectId: process.env.PROJECT_ID,
    callbackSecret: BATCH_CALLBACK_SECRET
  };
  
  console.log(`Sending callback to ${BATCH_CALLBACK_URL} for project ${process.env.PROJECT_ID}`);
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(callbackData);
    const url = new URL(BATCH_CALLBACK_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('Callback sent successfully');
          resolve();
        } else {
          console.error(`Callback failed with status ${res.statusCode}: ${responseData}`);
          reject(new Error(`Callback failed with status ${res.statusCode}: ${responseData}`));
        }
      });
    });
    
    req.on('error', (err) => {
      console.error(`Callback request failed: ${err.message}`);
      reject(new Error(`Callback request failed: ${err.message}`));
    });
    
    req.write(postData);
    req.end();
  });
}

/**
 * Lösche temporäre Dateien
 */
async function cleanupTempFiles() {
  console.log('Cleaning up temporary files');
  
  function deleteFolderRecursive(dirPath) {
    if (fs.existsSync(dirPath)) {
      fs.readdirSync(dirPath).forEach((file) => {
        const curPath = path.join(dirPath, file);
        if (fs.lstatSync(curPath).isDirectory()) {
          deleteFolderRecursive(curPath);
        } else {
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(dirPath);
    }
  }
  
  try {
    deleteFolderRecursive(TEMP_DIR);
    console.log('Successfully cleaned up temporary files');
  } catch (error) {
    console.error('Error cleaning up temporary files:', error);
  }
}

/**
 * Lade eine Datei von einer URL herunter
 */
async function downloadFromUrl(url, outputPath) {
  console.log(`Downloading from URL: ${url} to ${outputPath}`);
  
  // Prüfe, ob es sich um eine S3-URL handelt
  const s3UrlPattern = /https?:\/\/([^.]+)\.s3\.([^.]+)\.amazonaws\.com\/(.+)/;
  const s3Match = url.match(s3UrlPattern);
  
  if (s3Match) {
    // Es ist eine S3-URL, verwende die AWS SDK
    const bucket = s3Match[1];
    const key = s3Match[3];
    console.log(`Detected S3 URL. Bucket: ${bucket}, Key: ${key}`);
    return downloadFromS3(key, outputPath);
  } else {
    // Es ist eine normale HTTP/HTTPS-URL
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download file: ${response.statusCode} ${response.statusMessage}`));
          return;
        }
        
        const fileStream = fs.createWriteStream(outputPath);
        response.pipe(fileStream);
        
        fileStream.on('finish', () => {
          fileStream.close();
          console.log(`Successfully downloaded file to ${outputPath}`);
          resolve(outputPath);
        });
        
        fileStream.on('error', (err) => {
          fs.unlink(outputPath, () => {}); // Lösche die unvollständige Datei
          console.error(`Error writing to file: ${err.message}`);
          reject(err);
        });
      }).on('error', (err) => {
        console.error(`Error downloading file: ${err.message}`);
        reject(err);
      });
    });
  }
}

/**
 * Lade eine Datei von S3 herunter
 */
async function downloadFromS3(key, outputPath) {
  console.log(`Downloading from S3: ${S3_BUCKET}/${key} to ${outputPath}`);
  
  // Wenn der Key mit dem Bucket-Namen beginnt, entferne ihn
  if (key.startsWith(`${S3_BUCKET}/`)) {
    key = key.substring(S3_BUCKET.length + 1);
  }
  
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key
  });
  
  try {
    const response = await s3Client.send(command);
    const fileStream = fs.createWriteStream(outputPath);
    
    await new Promise((resolve, reject) => {
      response.Body.pipe(fileStream)
        .on('error', (err) => {
          console.error(`Error writing S3 file to disk: ${err.message}`);
          reject(err);
        })
        .on('finish', () => {
          console.log(`Successfully wrote S3 file to ${outputPath}`);
          resolve();
        });
    });
    
    return outputPath;
  } catch (error) {
    console.error(`Error downloading from S3: ${error.message}`);
    throw error;
  }
}

// Starte die Hauptfunktion
main(); 