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
const { execSync } = require('child_process');

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

// Initialisiere die TEMPLATE_DATA Variable aus der Umgebungsvariable
let TEMPLATE_DATA = null;
try {
  if (process.env.TEMPLATE_DATA) {
    TEMPLATE_DATA = JSON.parse(process.env.TEMPLATE_DATA);
    console.log('Successfully parsed TEMPLATE_DATA from environment variable');
  }
} catch (error) {
  console.error('Error parsing TEMPLATE_DATA from environment variable:', error.message);
  console.log('Will try to load from S3 if TEMPLATE_DATA_PATH is provided');
}

// Initialisiere den S3-Client
const s3Client = new S3Client({
  region: AWS_REGION
});
console.log(`Initialized S3 client with region: ${AWS_REGION}`);

// Log the actual callback URL we're using
console.log(`Using callback URL: ${BATCH_CALLBACK_URL}`);

/**
 * Hilfsfunktion, um benutzerspezifische S3-Pfade zu generieren
 * Unterstützt sowohl die neue strukturierte Pfadkonvention als auch Legacy-Pfade
 */
function generateUserScopedPath(baseFolder, fileName, userId = USER_ID) {
  // Wenn kein Benutzer angegeben ist, verwende den Legacy-Pfad
  if (!userId) {
    console.log(`Generiere Legacy-Pfad: ${baseFolder}/${fileName}`);
    return `${baseFolder}/${fileName}`;
  }

  // Sonst generiere einen mandantengetrennten Pfad
  const userScopedPath = `users/${userId}/${baseFolder}/${fileName}`;
  console.log(`Generiere mandantengetrennten Pfad: ${userScopedPath}`);
  return userScopedPath;
}

/**
 * Analysiert einen S3-Schlüssel und bestimmt, ob es ein Legacy- oder benutzerbasierter Pfad ist
 * Gibt den korrekten Pfad für die neue Struktur zurück
 */
function normalizeS3Key(key, targetFolder, userId = USER_ID) {
  // Prüfe, ob der Pfad bereits die korrekte Benutzerstruktur hat
  if (key.startsWith(`users/`)) {
    console.log(`Pfad bereits im richtigen Format: ${key}`);
    return key;
  }

  // Prüfe, ob der Pfad eine vollständige URL ist und extrahiere den Key
  if (key.startsWith('http')) {
    // Extrahiere den Key aus der URL
    // z.B. https://bucket.s3.region.amazonaws.com/final/video.mp4 -> final/video.mp4
    const urlParts = key.split('amazonaws.com/');
    if (urlParts.length > 1) {
      key = urlParts[1];
      console.log(`Extrahierter S3-Key aus URL: ${key}`);
    }
  }

  // Extrahiere den Dateinamen aus dem Pfad
  const fileName = key.split('/').pop();
  
  // Bestimme den Basisordner aus dem Pfad oder verwende den übergebenen targetFolder
  let baseFolder = targetFolder;
  if (!baseFolder) {
    // Versuche, den Basisordner aus dem Pfad zu extrahieren
    const pathParts = key.split('/');
    if (pathParts.length > 1) {
      baseFolder = pathParts[0];
    }
  }

  // Wenn wir keinen Basisordner haben, verwende einen Standardwert
  if (!baseFolder) {
    baseFolder = 'uploads';
    console.warn(`Kein Basisordner gefunden, verwende Standard: ${baseFolder}`);
  }

  // Generiere den neuen Pfad
  return generateUserScopedPath(baseFolder, fileName, userId);
}

/**
 * Lädt eine Datei von S3 herunter und speichert sie lokal
 */
async function downloadFileFromS3(s3Key, localPath) {
  console.log(`Downloading file from S3: ${s3Key} to ${localPath}`);
  
  // Stelle sicher, dass das Verzeichnis existiert
  const dirPath = path.dirname(localPath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  try {
    // Zuerst versuchen wir, die Datei direkt mit dem angegebenen Schlüssel herunterzuladen
    await downloadFile(s3Key, localPath);
    console.log(`Successfully downloaded file from S3: ${s3Key}`);
    return true;
  } catch (error) {
    console.warn(`Could not download using direct key: ${s3Key}. Error: ${error.message}`);
    
    // Wenn der direkte Download fehlschlägt, versuche mit dem normalisierten Pfad
    try {
      // Bestimme den Ordner aus dem Schlüssel
      const folder = s3Key.split('/')[0]; // z.B. 'uploads', 'processed', etc.
      const fileName = s3Key.split('/').pop(); // Der Dateiname
      
      // Versuche verschiedene Pfadvarianten
      const possiblePaths = [
        s3Key, // Originalschlüssel
        generateUserScopedPath(folder, fileName), // Benutzerspezifischer Pfad
        `${folder}/${fileName}` // Legacy-Pfad
      ];
      
      // Wenn USER_ID vorhanden ist, versuche auch den Pfad ohne Benutzerstruktur
      if (USER_ID) {
        possiblePaths.push(`${folder}/${USER_ID}/${fileName}`);
      }
      
      let success = false;
      for (const tryPath of possiblePaths) {
        if (tryPath === s3Key) continue; // Überspringen des bereits versuchten Pfads
        
        try {
          console.log(`Trying alternative path: ${tryPath}`);
          await downloadFile(tryPath, localPath);
          console.log(`Successfully downloaded file using alternative path: ${tryPath}`);
          success = true;
          break;
        } catch (altError) {
          console.warn(`Failed with alternative path ${tryPath}: ${altError.message}`);
        }
      }
      
      if (!success) {
        throw new Error(`Could not download file after trying multiple paths`);
      }
      
      return true;
    } catch (fallbackError) {
      console.error(`All download attempts failed for ${s3Key}: ${fallbackError.message}`);
      throw fallbackError;
    }
  }
}

/**
 * Hilfsfunktion für den eigentlichen Download-Prozess
 */
async function downloadFile(s3Key, localPath) {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key
  });
  
  const response = await s3Client.send(command);
  const chunks = [];
  
  // Stream die Daten in einen Buffer
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  
  // Schreibe den Buffer in eine Datei
  const buffer = Buffer.concat(chunks);
  fs.writeFileSync(localPath, buffer);
}

/**
 * Lädt eine Datei zu S3 hoch
 */
async function uploadFileToS3(localPath, s3Key) {
  console.log(`Uploading file to S3: ${localPath} -> ${s3Key}`);
  
  try {
    // Normalisiere den S3-Schlüssel
    const normalizedKey = normalizeS3Key(s3Key, null, USER_ID);
    
    // Lese die Datei ein
    const fileContent = fs.readFileSync(localPath);
    
    // Bestimme den MIME-Typ
    let contentType = 'application/octet-stream';
    if (localPath.endsWith('.mp4')) {
      contentType = 'video/mp4';
    } else if (localPath.endsWith('.mp3')) {
      contentType = 'audio/mpeg';
    } else if (localPath.endsWith('.json')) {
      contentType = 'application/json';
    } else if (localPath.endsWith('.txt')) {
      contentType = 'text/plain';
    }
    
    // Erstelle den Upload-Befehl
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: normalizedKey,
      Body: fileContent,
      ContentType: contentType
    });
    
    // Führe den Upload durch
    await s3Client.send(command);
    console.log(`Successfully uploaded file to S3: ${normalizedKey}`);
    
    return normalizedKey;
  } catch (error) {
    console.error(`Error uploading file to S3: ${error.message}`);
    throw error;
  }
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
function generateSrtContent(subtitleText, duration, wordTimestamps = null) {
  console.log(`Generating subtitles with precise timestamps`);
  console.log(`Have word timestamps: ${wordTimestamps ? 'YES' : 'NO'}, count: ${wordTimestamps ? wordTimestamps.length : 0}`);
  
  // Optimale Zeichenlänge pro Zeile für einzeilige Untertitel
  const MAX_CHARS_PER_LINE = 30;
  // Minimale Dauer für einen Untertitel in Sekunden
  const MIN_DURATION = 0.8;
  // Pause zwischen zwei Untertiteln in Sekunden (verhindert Überlappungen)
  const SUBTITLE_GAP = 0.1;
  
  let srtContent = '';
  let srtIndex = 1;
  
  // Wenn Zeitstempel vorhanden sind, verwende diese für präzise Synchronisation
  if (wordTimestamps && wordTimestamps.length > 0) {
    console.log(`Using ${wordTimestamps.length} word timestamps for precise subtitle synchronization`);
    
    // Debug: Zeige die ersten paar Timestamps an
    console.log('First few word timestamps:');
    wordTimestamps.slice(0, Math.min(5, wordTimestamps.length)).forEach((ts, i) => {
      console.log(`  ${i+1}: "${ts.word}" - ${ts.startTime.toFixed(3)}s to ${ts.endTime.toFixed(3)}s`);
    });
    
    // Einfacher Text-Split Ansatz - direkt Zeilen bilden
    let words = [];
    let currentLine = '';
    let currentStartTime = 0;
    let currentEndTime = 0;
    let lines = [];
    
    for (let i = 0; i < wordTimestamps.length; i++) {
      const { word, startTime, endTime } = wordTimestamps[i];
      
      // Setze Start-Zeit beim ersten Wort einer neuen Zeile
      if (currentLine === '') {
        currentStartTime = startTime;
      }
      
      // Setze End-Zeit beim jedem Wort (aktualisiert sich fortlaufend)
      currentEndTime = endTime;
      
      // Prüfe, ob das Wort in die aktuelle Zeile passt
      if ((currentLine + ' ' + word).trim().length <= MAX_CHARS_PER_LINE) {
        // Wort passt in die Zeile - füge es hinzu
        currentLine = (currentLine + ' ' + word).trim();
        words.push(word);
    } else {
        // Zeile ist voll - speichere sie und beginne eine neue
        if (currentLine) {
          lines.push({
            text: currentLine,
            startTime: currentStartTime,
            endTime: currentEndTime
          });
        }
        
        // Beginne neue Zeile mit aktuellem Wort
        currentLine = word;
        currentStartTime = startTime;
        currentEndTime = endTime;
        words = [word];
      }
      
      // Prüfe, ob das Wort ein Satzende bezeichnet oder ob es das letzte Wort ist
      const isEndOfSentence = /[.!?]$/.test(word);
      const isLastWord = i === wordTimestamps.length - 1;
      
      if (isEndOfSentence || isLastWord) {
        // Speichere die aktuelle Zeile, wenn wir am Ende eines Satzes oder des Textes sind
        if (currentLine) {
          lines.push({
            text: currentLine,
            startTime: currentStartTime,
            endTime: currentEndTime
          });
        }
        
        // Beginne mit einer neuen Zeile
        currentLine = '';
      }
    }
    
    console.log(`Created ${lines.length} subtitle lines`);
    
    // Jetzt formatiere die Linien als SRT
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Stelle sicher, dass jeder Untertitel eine Mindestdauer hat
      let displayDuration = line.endTime - line.startTime;
      if (displayDuration < MIN_DURATION) {
        line.endTime = line.startTime + MIN_DURATION;
      }
      
      // Wichtig: Stelle sicher, dass sich Untertitel nicht überlappen
      // Wenn der nächste Untertitel existiert, füge eine kleine Pause hinzu
      if (i < lines.length - 1) {
        // Wenn der aktuelle Untertitel zu nah am nächsten ist, kürze ihn
        if (lines[i + 1].startTime < line.endTime + SUBTITLE_GAP) {
          // Setze Ende des aktuellen Untertitels vor Beginn des nächsten mit Abstand
          line.endTime = Math.max(line.startTime + 0.5, lines[i + 1].startTime - SUBTITLE_GAP);
        }
      }
      
      // Formatiere die Zeiten im SRT-Format
      const startTimeFormatted = formatTime(line.startTime);
      const endTimeFormatted = formatTime(line.endTime);
      
      // Füge den SRT-Eintrag hinzu
      srtContent += `${srtIndex}\n${startTimeFormatted} --> ${endTimeFormatted}\n${line.text}\n\n`;
      srtIndex++;
    }
  } else {
    // Code für den Fall ohne Zeitstempel - zeichenbasierte Strategie
    console.log('No word timestamps available - using simple splitting strategy');
    
    const sentences = subtitleText.split(/(?<=[.!?])\s+/);
    let currentTime = 0;
    const timePerChar = duration / subtitleText.length;
    
    for (const sentence of sentences) {
      if (!sentence.trim()) continue;
      
      // Teile in Zeilen bei maximaler Länge
      let remainingSentence = sentence;
      while (remainingSentence.length > 0) {
        const lineLength = Math.min(remainingSentence.length, MAX_CHARS_PER_LINE);
        const line = remainingSentence.substring(0, lineLength);
        remainingSentence = remainingSentence.substring(lineLength).trim();
        
        const lineStart = currentTime;
        const lineDuration = Math.max(MIN_DURATION, line.length * timePerChar);
        
        // Füge eine kleine Pause zwischen Untertiteln ein
        currentTime += lineDuration + SUBTITLE_GAP;
        
        // Formatiere die Zeiten im SRT-Format
        const startTimeFormatted = formatTime(lineStart);
        const endTimeFormatted = formatTime(currentTime - SUBTITLE_GAP); // Ende ohne Pause
        
        // Füge den SRT-Eintrag hinzu
        srtContent += `${srtIndex}\n${startTimeFormatted} --> ${endTimeFormatted}\n${line}\n\n`;
        srtIndex++;
      }
    }
  }
  
  console.log('Generated SRT content successfully');
  console.log('SRT content preview:');
  console.log(srtContent.split('\n\n').slice(0, 3).join('\n\n'));
  
  return srtContent;
}

/**
 * Konvertiert SRT-Untertitel in das ASS-Format mit benutzerdefinierten Styles
 * ASS bietet bessere Kontrolle für transparente Hintergründe
 */
function convertSrtToAss(srtContent, fontName, fontSize, primaryColor, backgroundColor, borderStyle, hasTransparentBg) {
  console.log('Converting SRT to ASS format for better transparency control');
  
  // Entferne das &H-Präfix für die ASS-Datei
  let primaryColorAss = primaryColor.replace('&H00', '&H');
  let backgroundColorAss = backgroundColor;
  
  // ASS-Header erzeugen mit höherer Auflösung für bessere Qualität
  let assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
`;

  // Style-Definition für optimale Lesbarkeit
  // Bei transparenten Hintergründen benötigen wir eine dickere, aber subtilere Outline
  // und einen sanfteren Schatten für bessere Lesbarkeit auf allen Hintergründen
  
  // Bold-Parameter für bessere Lesbarkeit (1=true, 0=false)
  let boldParam = 1;
  
  // Optimierte Parameter für transparenten Hintergrund
  let outlineSize = hasTransparentBg ? 2.2 : 0.5;  // Dickere Outline bei transparentem Hintergrund
  let shadowSize = hasTransparentBg ? 1.2 : 0.2;   // Leichter Schatten bei transparentem Hintergrund
  let assBackColor = hasTransparentBg ? "&H00FFFFFF" : backgroundColorAss; // Vollständig transparent
  let assBorderStyle = 1; // Immer Outline+Shadow für konsistentes Aussehen
  
  // MarginV - Abstand vom unteren/oberen Rand in Pixeln
  // Höherer Wert für mehr Abstand bei "bottom" position
  let marginV = 30;
  
  // Alignment: 2=bottom, 8=top, 5=middle; wir verwenden immer bottom für bessere Lesbarkeit
  let alignmentValue = 2;
  
  assContent += `Style: Default,${fontName},${fontSize},${primaryColorAss},${primaryColorAss},&H000000,${assBackColor},${boldParam},0,0,0,100,100,0,0,${assBorderStyle},${outlineSize},${shadowSize},${alignmentValue},20,20,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // SRT-Parser mit verbesserter Zeitgenauigkeit
  // Wir behalten die exakten Zeitstempel bei, ohne Verschiebung
  const srtLines = srtContent.split("\n");
  let lineIndex = 0;
  let eventId = 1;
  
  while (lineIndex < srtLines.length) {
    // Überspringe leere Zeilen
    if (!srtLines[lineIndex].trim()) {
      lineIndex++;
      continue;
    }
    
    // Wir erwarten, dass jeder Eintrag mit einer Nummer beginnt
    if (!/^\d+$/.test(srtLines[lineIndex].trim())) {
      lineIndex++;
      continue;
    }
    
    lineIndex++; // Zur Zeitstempelzeile
    
    if (lineIndex >= srtLines.length) break;
    
    // Format: 00:00:00,000 --> 00:00:00,000
    const timeLine = srtLines[lineIndex].trim();
    const timeMatch = timeLine.match(/(\d+:\d+:\d+,\d+)\s+-->\s+(\d+:\d+:\d+,\d+)/);
    
    if (!timeMatch) {
      lineIndex++;
      continue;
    }
    
    // Konvertiere SRT-Zeitformat zu ASS-Zeitformat (Komma zu Punkt) ohne Verschiebung
    const startTime = timeMatch[1].replace(',', '.');
    const endTime = timeMatch[2].replace(',', '.');
    
    lineIndex++; // Zur Textzeile
    
    let text = "";
    // Lese alle Textzeilen bis zur nächsten leeren Zeile
    while (lineIndex < srtLines.length && srtLines[lineIndex].trim() !== "") {
      text += (text ? "\\N" : "") + srtLines[lineIndex].trim();
      lineIndex++;
    }
    
    // ASS-Ereigniszeile erzeugen
    assContent += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}\n`;
    
    eventId++;
  }
  
  return assContent;
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
        await downloadFileFromS3(templateDataPath, tempDataPath);
        
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
        
        // 7. Wenn Untertitel erwünscht sind, aber kein Voiceover vorhanden ist
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
            
            // **** ENVIORNMENT VARS DEBUGGING ****
            console.log('\n\n==== ENVIRONMENT VARS FOR TIMESTAMPS DEBUGGING ====');
            console.log('WORD_TIMESTAMPS exists:', !!process.env.WORD_TIMESTAMPS);
            console.log('WORD_TIMESTAMPS_PATH exists:', !!process.env.WORD_TIMESTAMPS_PATH);
            
            // Liste alle Umgebungsvariablen mit "TIME", "STAMP", "WORD" oder "VOICE" im Namen auf
            const relevantVars = Object.keys(process.env)
              .filter(key => key.includes('TIME') || key.includes('STAMP') || key.includes('WORD') || key.includes('VOICE'));
            console.log('All relevant environment variables:', relevantVars);
            console.log('==== END OF ENVIRONMENT VARS DEBUGGING ====\n\n');
            
            // Versuche zuerst, die Zeitstempel aus der Umgebungsvariable zu laden
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
                console.log('Will try WORD_TIMESTAMPS_PATH or fall back to character-based timing');
                wordTimestamps = null;
              }
            } 
            // Wenn keine direkten Timestamps gefunden wurden oder sie ungültig waren, versuche sie von S3 zu laden
            else if (process.env.WORD_TIMESTAMPS_PATH) {
              console.log(`No direct WORD_TIMESTAMPS found, but found WORD_TIMESTAMPS_PATH: ${process.env.WORD_TIMESTAMPS_PATH}`);
              
              try {
                // S3-Datei herunterladen
                console.log(`Downloading timestamps from S3: ${process.env.WORD_TIMESTAMPS_PATH}`);
                
                const s3BucketName = process.env.S3_BUCKET || '';
                if (!s3BucketName) {
                  throw new Error('S3_BUCKET environment variable not set');
                }
                
                // Erstelle temporären Pfad für die heruntergeladene Datei
                const localTimestampsPath = path.join(TEMP_DIR, 'timestamps.json');
                
                // Download der Datei mit AWS CLI
                const downloadCmd = `aws s3 cp s3://${s3BucketName}/${process.env.WORD_TIMESTAMPS_PATH} ${localTimestampsPath} --region ${process.env.AWS_REGION || 'eu-central-1'}`;
                console.log(`Running S3 download command: ${downloadCmd}`);
                
                try {
                  execSync(downloadCmd, { stdio: 'inherit' });
                  console.log(`Successfully downloaded timestamps file to ${localTimestampsPath}`);
                  
                  // Datei einlesen und parsen
                  const timestampsContent = fs.readFileSync(localTimestampsPath, 'utf-8');
                  console.log(`Timestamp file size: ${timestampsContent.length} bytes`);
                  
                  wordTimestamps = JSON.parse(timestampsContent);
                  if (Array.isArray(wordTimestamps) && wordTimestamps.length > 0) {
                    console.log(`Successfully loaded ${wordTimestamps.length} word timestamps from S3`);
                    
                    // Ausgabe einiger Beispiel-Timestamps
                    console.log('First 3 timestamps from S3:');
                    wordTimestamps.slice(0, Math.min(3, wordTimestamps.length)).forEach((ts, i) => {
                      console.log(`  ${i+1}: "${ts.word}" - ${ts.startTime}s to ${ts.endTime}s`);
                    });
                  } else {
                    console.error('Timestamps from S3 are not in the expected format (array)');
                    wordTimestamps = null;
                  }
                } catch (execError) {
                  console.error('Error downloading timestamps from S3:', execError.message);
                  wordTimestamps = null;
                }
              } catch (s3Error) {
                console.error('Error processing timestamps from S3:', s3Error);
                console.log('Falling back to character-based timing');
                wordTimestamps = null;
              }
            } else {
              console.log('No word timestamps provided, using character-based timing');
            }
            
            // Generiere SRT-Inhalt
            const srtContent = generateSrtContent(subtitleText, 2.5, wordTimestamps);
            
            // Schreibe SRT-Datei
            fs.writeFileSync(srtFile, srtContent);
            console.log(`Created SRT file for subtitles at ${srtFile}`);
            console.log('SRT file stats:', fs.statSync(srtFile).size, 'bytes');
            
            // Setze Positionsparameter je nach gewählter Position
            let positionParam = '';
            if (position === 'top') {
              positionParam = '15';
            } else if (position === 'middle') {
              positionParam = '50';
            } else {
              // Position "bottom" bedeutet eigentlich "lower-third" (unteres Drittel)
              positionParam = '70';
            }
            
            // Überprüfe transparent Background
            const hasTransparentBg = 
              backgroundColor === '#00000000' || 
              backgroundColor.toLowerCase().includes('00000000') ||
              backgroundColor === 'transparent';
              
            console.log(`Using subtitle position: ${position} (param: ${positionParam})`);
            console.log(`Background is transparent: ${hasTransparentBg}`);
            
            // Erstelle neues Video mit Untertiteln
            const subtitledFile = path.join(OUTPUT_DIR, 'final_with_subtitles.mp4');
            
            // Verbesserte FFmpeg-Parameter für Untertitel mit angepasster Schriftgröße
            // Reduziere die Schriftgröße deutlich für bessere Lesbarkeit
            const actualFontSize = 16; // Feste kleinere Schriftgröße statt einer variablen
            console.log(`Using font size: ${actualFontSize}`);
            
            const subtitleParams = hasTransparentBg 
              ? `subtitles=${srtFile.replace(/\\/g, '/')}:force_style='FontName=${fontName},FontSize=${actualFontSize},PrimaryColour=${primaryColorFFmpeg},OutlineColour=&H000000,Outline=1,Shadow=1,BorderStyle=1,ShadowColour=&H000000,Alignment=2,MarginV=${positionParam}'` 
              : `subtitles=${srtFile.replace(/\\/g, '/')}:force_style='FontName=${fontName},FontSize=${actualFontSize},PrimaryColour=${primaryColorFFmpeg},BackColour=${backgroundColorFFmpeg},BorderStyle=${borderStyle},Alignment=2,MarginV=${positionParam}'`;
            
            console.log(`Using FFmpeg subtitle filter: ${subtitleParams}`);
            
            // Verwende -vf für Videofilter
            await runFFmpeg([
              '-i', finalFile,
              '-vf', subtitleParams,
              '-c:v', 'libx264',
              '-preset', 'medium',
              '-crf', '23',
              '-c:a', 'copy',
              '-y',
              subtitledFile
            ]);
            
            console.log(`Successfully added subtitles to video: ${subtitledFile}`);
            
            // Verify the file exists
            if (!fs.existsSync(subtitledFile) || fs.statSync(subtitledFile).size === 0) {
              throw new Error(`Subtitled file is empty or does not exist: ${subtitledFile}`);
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
      
      // **** ENVIORNMENT VARS DEBUGGING ****
      console.log('\n\n==== ENVIRONMENT VARS FOR TIMESTAMPS DEBUGGING ====');
      console.log('WORD_TIMESTAMPS exists:', !!process.env.WORD_TIMESTAMPS);
      console.log('WORD_TIMESTAMPS_PATH exists:', !!process.env.WORD_TIMESTAMPS_PATH);
      
      // Liste alle Umgebungsvariablen mit "TIME", "STAMP", "WORD" oder "VOICE" im Namen auf
      const relevantVars = Object.keys(process.env)
        .filter(key => key.includes('TIME') || key.includes('STAMP') || key.includes('WORD') || key.includes('VOICE'));
      console.log('All relevant environment variables:', relevantVars);
      console.log('==== END OF ENVIRONMENT VARS DEBUGGING ====\n\n');
      
      // Versuche zuerst, die Zeitstempel aus der Umgebungsvariable zu laden
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
          console.log('Will try WORD_TIMESTAMPS_PATH or fall back to character-based timing');
          wordTimestamps = null;
        }
      } 
      // Wenn keine direkten Timestamps gefunden wurden oder sie ungültig waren, versuche sie von S3 zu laden
      else if (process.env.WORD_TIMESTAMPS_PATH) {
        console.log(`No direct WORD_TIMESTAMPS found, but found WORD_TIMESTAMPS_PATH: ${process.env.WORD_TIMESTAMPS_PATH}`);
        
        try {
          // S3-Datei herunterladen
          console.log(`Downloading timestamps from S3: ${process.env.WORD_TIMESTAMPS_PATH}`);
          
          const s3BucketName = process.env.S3_BUCKET || '';
          if (!s3BucketName) {
            throw new Error('S3_BUCKET environment variable not set');
          }
          
          // Erstelle temporären Pfad für die heruntergeladene Datei
          const localTimestampsPath = path.join(TEMP_DIR, 'timestamps.json');
          
          // Download der Datei mit AWS CLI
          const downloadCmd = `aws s3 cp s3://${s3BucketName}/${process.env.WORD_TIMESTAMPS_PATH} ${localTimestampsPath} --region ${process.env.AWS_REGION || 'eu-central-1'}`;
          console.log(`Running S3 download command: ${downloadCmd}`);
          
          try {
            execSync(downloadCmd, { stdio: 'inherit' });
            console.log(`Successfully downloaded timestamps file to ${localTimestampsPath}`);
            
            // Datei einlesen und parsen
            const timestampsContent = fs.readFileSync(localTimestampsPath, 'utf-8');
            console.log(`Timestamp file size: ${timestampsContent.length} bytes`);
            
            wordTimestamps = JSON.parse(timestampsContent);
            if (Array.isArray(wordTimestamps) && wordTimestamps.length > 0) {
              console.log(`Successfully loaded ${wordTimestamps.length} word timestamps from S3`);
              
              // Ausgabe einiger Beispiel-Timestamps
              console.log('First 3 timestamps from S3:');
              wordTimestamps.slice(0, Math.min(3, wordTimestamps.length)).forEach((ts, i) => {
                console.log(`  ${i+1}: "${ts.word}" - ${ts.startTime}s to ${ts.endTime}s`);
              });
            } else {
              console.error('Timestamps from S3 are not in the expected format (array)');
              wordTimestamps = null;
            }
          } catch (execError) {
            console.error('Error downloading timestamps from S3:', execError.message);
            wordTimestamps = null;
          }
        } catch (s3Error) {
          console.error('Error processing timestamps from S3:', s3Error);
          console.log('Falling back to character-based timing');
          wordTimestamps = null;
        }
      } else {
        console.log('No word timestamps provided, using character-based timing');
      }
      
      // Generiere SRT-Inhalt
      const srtContent = generateSrtContent(subtitleText, 2.5, wordTimestamps);
      
      // Schreibe SRT-Datei
      fs.writeFileSync(srtFile, srtContent);
      console.log(`Created SRT file for subtitles at ${srtFile}`);
      console.log('SRT file stats:', fs.statSync(srtFile).size, 'bytes');
      
      // Setze Positionsparameter je nach gewählter Position
      let positionParam = '';
      if (position === 'top') {
        positionParam = '15';
      } else if (position === 'middle') {
        positionParam = '50';
      } else {
        // Position "bottom" bedeutet eigentlich "lower-third" (unteres Drittel)
        positionParam = '70';
      }
      
      // Überprüfe transparent Background
      const hasTransparentBg = 
        backgroundColor === '#00000000' || 
        backgroundColor.toLowerCase().includes('00000000') ||
        backgroundColor === 'transparent';
        
      console.log(`Using subtitle position: ${position} (param: ${positionParam})`);
      console.log(`Background is transparent: ${hasTransparentBg}`);
      
      // Erstelle neues Video mit Untertiteln
      const subtitledFile = path.join(OUTPUT_DIR, 'final_with_subtitles.mp4');
      
      // Verbesserte FFmpeg-Parameter für Untertitel mit angepasster Schriftgröße
      // Reduziere die Schriftgröße deutlich für bessere Lesbarkeit
      const actualFontSize = 16; // Feste kleinere Schriftgröße statt einer variablen
      console.log(`Using font size: ${actualFontSize}`);
      
      const subtitleParams = hasTransparentBg 
        ? `subtitles=${srtFile.replace(/\\/g, '/')}:force_style='FontName=${fontName},FontSize=${actualFontSize},PrimaryColour=${primaryColorFFmpeg},OutlineColour=&H000000,Outline=1,Shadow=1,BorderStyle=1,ShadowColour=&H000000,Alignment=2,MarginV=${positionParam}'` 
        : `subtitles=${srtFile.replace(/\\/g, '/')}:force_style='FontName=${fontName},FontSize=${actualFontSize},PrimaryColour=${primaryColorFFmpeg},BackColour=${backgroundColorFFmpeg},BorderStyle=${borderStyle},Alignment=2,MarginV=${positionParam}'`;
      
      console.log(`Using FFmpeg subtitle filter: ${subtitleParams}`);
      
      // Verwende -vf für Videofilter
      await runFFmpeg([
        '-i', finalFile,
        '-vf', subtitleParams,
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'copy',
        '-y',
        subtitledFile
      ]);
      
      console.log(`Successfully added subtitles to video: ${subtitledFile}`);
      
      // Verify the file exists
      if (!fs.existsSync(subtitledFile) || fs.statSync(subtitledFile).size === 0) {
        throw new Error(`Subtitled file is empty or does not exist: ${subtitledFile}`);
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

// Lade die Template-Daten aus S3
async function loadTemplateDataFromS3(templateDataPath) {
  console.log(`Loading template data from S3 path: ${templateDataPath}`);
  
  try {
    // Verwende die Funktion, die verschiedene Pfadformate ausprobiert
    const localPath = path.join(TEMP_DIR, 'template-data.json');
    await downloadFileFromS3(templateDataPath, localPath);
    
    // Lese die Datei ein
    const templateDataStr = fs.readFileSync(localPath, 'utf-8');
    console.log(`Template data file loaded from S3, size: ${templateDataStr.length} bytes`);
    
    return JSON.parse(templateDataStr);
  } catch (error) {
    console.error(`Error loading template data from S3: ${error.message}`);
    throw error;
  }
}

// Starte die Hauptfunktion
main(); 