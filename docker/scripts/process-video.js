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
 * - S3_BUCKET: Name des S3-Buckets
 * - AWS_REGION: AWS-Region
 * - BATCH_CALLBACK_SECRET: Secret-Key für die Callback-API
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');

// Temporäre Verzeichnisse für Dateien
const TEMP_DIR = '/tmp/video-processing';
const INPUT_DIR = `${TEMP_DIR}/input`;
const OUTPUT_DIR = `${TEMP_DIR}/output`;

// Aktiviere Debug-Modus
const DEBUG = process.env.DEBUG === 'true';

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

// Parse TEMPLATE_DATA with improved error handling
let TEMPLATE_DATA = null;
try {
  if (process.env.TEMPLATE_DATA) {
    // Trim any whitespace that might cause JSON parsing issues
    const templateDataStr = process.env.TEMPLATE_DATA.trim();
    console.log(`TEMPLATE_DATA length: ${templateDataStr.length}`);
    
    // Check for valid JSON structure
    if (templateDataStr.startsWith('{') && templateDataStr.endsWith('}')) {
      TEMPLATE_DATA = JSON.parse(templateDataStr);
      console.log('Successfully parsed TEMPLATE_DATA');
      
      // Validate required fields
      if (!TEMPLATE_DATA.segments || !Array.isArray(TEMPLATE_DATA.segments)) {
        console.warn('TEMPLATE_DATA is missing segments array or it is not an array');
        TEMPLATE_DATA.segments = TEMPLATE_DATA.segments || [];
      }
      
      if (TEMPLATE_DATA.voiceoverId) {
        console.log(`Voiceover ID found: ${TEMPLATE_DATA.voiceoverId}`);
      }
    } else {
      console.error('TEMPLATE_DATA does not appear to be a valid JSON object');
      console.log('TEMPLATE_DATA first char:', templateDataStr.charAt(0));
      console.log('TEMPLATE_DATA last char:', templateDataStr.charAt(templateDataStr.length - 1));
    }
  } else {
    console.warn('TEMPLATE_DATA environment variable is not set');
  }
} catch (error) {
  console.error('Error parsing TEMPLATE_DATA:', error.message);
  console.log('TEMPLATE_DATA raw value (first 200 chars):', 
    process.env.TEMPLATE_DATA ? process.env.TEMPLATE_DATA.substring(0, 200) : 'undefined');
  console.log('TEMPLATE_DATA raw value (last 200 chars):', 
    process.env.TEMPLATE_DATA ? process.env.TEMPLATE_DATA.substring(process.env.TEMPLATE_DATA.length - 200) : 'undefined');
}

// S3-Client
const s3Client = new S3Client({
  region: AWS_REGION
});

/**
 * Hauptfunktion für die Videoverarbeitung
 */
async function main() {
  try {
    console.log(`Starting video processing job '${JOB_TYPE}' for user ${USER_ID}`);
    console.log(`Job ID: ${AWS_BATCH_JOB_ID}`);
    console.log(`Project ID: ${PROJECT_ID}`);
    console.log(`Input video URL: ${INPUT_VIDEO_URL}`);
    console.log(`Output key: ${OUTPUT_KEY}`);
    console.log(`S3 bucket: ${S3_BUCKET}`);
    
    // Validiere erforderliche Umgebungsvariablen
    if (!S3_BUCKET) {
      throw new Error('S3_BUCKET or S3_BUCKET_NAME environment variable is required');
    }
    
    if (!OUTPUT_KEY) {
      throw new Error('OUTPUT_KEY environment variable is required');
    }
    
    // For generate-final, we need TEMPLATE_DATA but we'll try to proceed even if it's not perfect
    if (JOB_TYPE === 'generate-final') {
      if (!TEMPLATE_DATA) {
        throw new Error('TEMPLATE_DATA environment variable is required for generate-final job type');
      }
      
      if (!TEMPLATE_DATA.segments || !Array.isArray(TEMPLATE_DATA.segments) || TEMPLATE_DATA.segments.length === 0) {
        throw new Error('No video segments provided in TEMPLATE_DATA');
      }
    }
    
    // Erstelle temporäre Verzeichnisse
    await createDirectories();
    
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
  const trimmedFiles = [];
  for (let i = 0; i < segmentFiles.length; i++) {
    const segment = segmentFiles[i];
    const outputFile = path.join(OUTPUT_DIR, `trimmed_${i}.mp4`);
    
    console.log(`Trimming segment ${i+1}/${segmentFiles.length}: startTime=${segment.startTime}, duration=${segment.duration}`);
    
    // FFmpeg-Befehl zum Trimmen eines Segments
    const args = [
      '-i', segment.file,
      '-ss', segment.startTime.toString(),
      '-t', segment.duration.toString(),
      '-c', 'copy',
      '-y',
      outputFile
    ];
    
    try {
      await runFFmpeg(args);
      console.log(`Successfully trimmed segment ${i+1}`);
      
      // Verify the trimmed file exists and has content
      if (!fs.existsSync(outputFile) || fs.statSync(outputFile).size === 0) {
        throw new Error(`Trimmed file is empty or does not exist: ${outputFile}`);
      }
      
      trimmedFiles.push({
        file: outputFile,
        position: segment.position
      });
    } catch (error) {
      console.error(`Error trimming segment ${i+1}:`, error.message);
      throw new Error(`Failed to trim segment ${i+1}: ${error.message}`);
    }
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
      '-c', 'copy',
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
  if (TEMPLATE_DATA.voiceoverId) {
    console.log(`Voiceover ID found: ${TEMPLATE_DATA.voiceoverId}`);
    
    try {
      // Lade die Voiceover-Datei von S3 herunter
      const voiceoverPath = path.join(INPUT_DIR, `voiceover_${TEMPLATE_DATA.voiceoverId}.mp3`);
      
      // Versuche verschiedene mögliche Pfade für die Voiceover-Datei
      const possiblePaths = [
        `audio/${TEMPLATE_DATA.voiceoverId}.mp3`,
        `audio/voiceover_${TEMPLATE_DATA.voiceoverId}.mp3`,
        `audio/${TEMPLATE_DATA.voiceoverId}`,
        `voiceovers/${TEMPLATE_DATA.voiceoverId}.mp3`,
        `voiceovers/voiceover_${TEMPLATE_DATA.voiceoverId}.mp3`
      ];
      
      // Check if voiceover file exists in S3 before attempting to download
      let voiceoverExists = false;
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
          console.log(`Voiceover file found in S3: ${voiceoverKey}`);
          break;
        } catch (error) {
          console.log(`Voiceover not found at ${voiceoverKey}`);
        }
      }
      
      if (!voiceoverExists) {
        console.warn(`Voiceover file not found in S3 for ID: ${TEMPLATE_DATA.voiceoverId}`);
        console.log('Continuing without voiceover');
        return concatenatedFile;
      }
      
      // Download the voiceover file
      try {
        console.log(`Downloading voiceover from S3: ${existingVoiceoverKey}`);
        await downloadFromS3(existingVoiceoverKey, voiceoverPath);
        console.log(`Successfully downloaded voiceover to ${voiceoverPath}`);
        
        // Verify the voiceover file exists and has content
        if (!fs.existsSync(voiceoverPath) || fs.statSync(voiceoverPath).size === 0) {
          throw new Error(`Downloaded voiceover file is empty or does not exist: ${voiceoverPath}`);
        }
      } catch (error) {
        console.error(`Error downloading voiceover: ${error.message}`);
        console.log('Continuing without voiceover due to download error');
        return concatenatedFile;
      }
      
      const finalFile = path.join(OUTPUT_DIR, 'final.mp4');
      
      // FFmpeg-Befehl zum Hinzufügen des Voiceovers
      console.log('Adding voiceover to video...');
      try {
        await runFFmpeg([
          '-i', concatenatedFile,
          '-i', voiceoverPath,
          '-map', '0:v', // Video vom ersten Input
          '-map', '1:a', // Audio vom zweiten Input
          '-c:v', 'copy',
          '-shortest',
          '-y',
          finalFile
        ]);
        
        console.log('Successfully added voiceover to video');
        
        // Verify the final file exists and has content
        if (!fs.existsSync(finalFile) || fs.statSync(finalFile).size === 0) {
          throw new Error(`Final file with voiceover is empty or does not exist: ${finalFile}`);
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
    callbackSecret: BATCH_CALLBACK_SECRET
  };
  
  console.log(`Sending callback to ${BATCH_CALLBACK_URL}`);
  
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

/**
 * Lade eine Datei von S3 herunter
 */
async function downloadFromS3(key, outputPath) {
  console.log(`Downloading from S3: ${S3_BUCKET}/${key} to ${outputPath}`);
  
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
    
    console.log(`Successfully downloaded ${key}`);
    return outputPath;
  } catch (error) {
    console.error(`Error downloading from S3: ${error.message}`);
    throw error;
  }
}

// Starte die Hauptfunktion
main(); 