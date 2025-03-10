#!/usr/bin/env node

/**
 * FFmpeg Video-Verarbeitungs-Skript für AWS Batch
 * 
 * Dieses Skript wird in einem Docker-Container ausgeführt und verarbeitet Videos basierend
 * auf den Umgebungsvariablen, die von AWS Batch übergeben werden.
 * 
 * Umgebungsvariablen:
 * - JOB_TYPE: 'trim', 'concat', 'voiceover', 'complete'
 * - INPUT_KEYS: JSON-Array von S3-Schlüsseln für die Eingabevideos
 * - OUTPUT_KEY: S3-Schlüssel für die Ausgabedatei
 * - USER_ID: ID des Benutzers, der den Job gestartet hat
 * - JOB_PARAMS: JSON-String mit zusätzlichen Job-Parametern
 * - S3_BUCKET: Name des S3-Buckets
 * - AWS_REGION: AWS-Region
 * - BATCH_CALLBACK_SECRET: Secret-Key für die Callback-API
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

// Temporäre Verzeichnisse für Dateien
const TEMP_DIR = '/tmp/video-processing';
const INPUT_DIR = `${TEMP_DIR}/input`;
const OUTPUT_DIR = `${TEMP_DIR}/output`;

// Umgebungsvariablen aus AWS Batch
const JOB_TYPE = process.env.JOB_TYPE || 'trim';
const INPUT_KEYS = JSON.parse(process.env.INPUT_KEYS || '[]');
const OUTPUT_KEY = process.env.OUTPUT_KEY || '';
const USER_ID = process.env.USER_ID || '';
const JOB_PARAMS = JSON.parse(process.env.JOB_PARAMS || '{}');
const S3_BUCKET = process.env.S3_BUCKET || '';
const AWS_REGION = process.env.AWS_REGION || 'eu-central-1';
const BATCH_CALLBACK_SECRET = process.env.BATCH_CALLBACK_SECRET || '';
const CALLBACK_URL = process.env.CALLBACK_URL || 'https://your-app-url.com/api/batch-callback';
const AWS_BATCH_JOB_ID = process.env.AWS_BATCH_JOB_ID || '';

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
    console.log(`Job parameters: ${JSON.stringify(JOB_PARAMS)}`);
    
    // Erstelle temporäre Verzeichnisse
    await createDirectories();
    
    // Lade Eingabedateien von S3 herunter
    const inputFiles = await downloadInputFiles();
    
    // Verarbeite Video je nach Job-Typ
    let outputFilePath;
    switch (JOB_TYPE) {
      case 'trim':
        outputFilePath = await trimVideo(inputFiles[0], JOB_PARAMS);
        break;
      case 'concat':
        outputFilePath = await concatenateVideos(inputFiles);
        break;
      case 'voiceover':
        outputFilePath = await addVoiceover(inputFiles[0], JOB_PARAMS.voiceoverKey, inputFiles[1]);
        break;
      case 'complete':
        outputFilePath = await generateCompleteVideo(inputFiles, JOB_PARAMS);
        break;
      default:
        throw new Error(`Unbekannter Job-Typ: ${JOB_TYPE}`);
    }
    
    // Lade das verarbeitete Video zu S3 hoch
    await uploadOutputFile(outputFilePath);
    
    // Sende Callback für erfolgreichen Job
    await sendCallback({
      status: 'success',
      outputKey: OUTPUT_KEY
    });
    
    console.log('Video processing completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error processing video:', error);
    
    // Sende Callback für fehlgeschlagenen Job
    try {
      await sendCallback({
        status: 'failed',
        error: error.message
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
  for (const dir of [TEMP_DIR, INPUT_DIR, OUTPUT_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Lade Eingabedateien von S3 herunter
 */
async function downloadInputFiles() {
  const downloadPromises = INPUT_KEYS.map(async (key, index) => {
    const fileExt = path.extname(key);
    const localPath = path.join(INPUT_DIR, `input_${index}${fileExt}`);
    
    console.log(`Downloading ${key} to ${localPath}`);
    
    const command = new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: key
    });
    
    const response = await s3Client.send(command);
    const fileStream = fs.createWriteStream(localPath);
    
    await new Promise((resolve, reject) => {
      response.Body.pipe(fileStream)
        .on('error', reject)
        .on('finish', resolve);
    });
    
    return localPath;
  });
  
  return Promise.all(downloadPromises);
}

/**
 * Schneide ein Video
 */
async function trimVideo(inputFile, params) {
  const { startTime, duration } = params;
  const outputFile = path.join(OUTPUT_DIR, 'trimmed.mp4');
  
  console.log(`Trimming video: startTime=${startTime}, duration=${duration}`);
  
  // FFmpeg-Befehl zum Trimmen eines Videos
  const args = [
    '-i', inputFile,
    '-ss', startTime.toString(),
    '-t', duration.toString(),
    '-c', 'copy',
    '-y',
    outputFile
  ];
  
  await runFFmpeg(args);
  return outputFile;
}

/**
 * Füge mehrere Videos zusammen
 */
async function concatenateVideos(inputFiles) {
  // Erstelle temporäre Dateiliste
  const concatFile = path.join(TEMP_DIR, 'concat.txt');
  const fileContents = inputFiles.map(file => 
    `file '${file.replace(/'/g, "'\\''")}'`
  ).join('\n');
  
  fs.writeFileSync(concatFile, fileContents);
  
  const outputFile = path.join(OUTPUT_DIR, 'concatenated.mp4');
  
  console.log(`Concatenating ${inputFiles.length} videos`);
  
  // FFmpeg-Befehl zum Verketten von Videos
  const args = [
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-c', 'copy',
    '-y',
    outputFile
  ];
  
  await runFFmpeg(args);
  return outputFile;
}

/**
 * Füge Voiceover zu einem Video hinzu
 */
async function addVoiceover(videoFile, voiceoverKey, audioFile) {
  const outputFile = path.join(OUTPUT_DIR, 'with_voiceover.mp4');
  
  console.log(`Adding voiceover to video`);
  
  // FFmpeg-Befehl zum Hinzufügen eines Voiceovers
  const args = [
    '-i', videoFile,
    '-i', audioFile,
    '-map', '0:v', // Video vom ersten Input
    '-map', '1:a', // Audio vom zweiten Input
    '-c:v', 'copy',
    '-shortest',
    '-y',
    outputFile
  ];
  
  await runFFmpeg(args);
  return outputFile;
}

/**
 * Generiere ein komplettes Video mit allen Schritten
 */
async function generateCompleteVideo(inputFiles, params) {
  const { segments, voiceoverKey } = params;
  
  // 1. Trimme jedes Segment
  const trimmedFiles = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const videoFile = inputFiles.find((_, index) => 
      INPUT_KEYS[index].includes(segment.videoKey)
    );
    
    if (!videoFile) {
      throw new Error(`Video file not found for segment ${i}`);
    }
    
    const outputFile = path.join(OUTPUT_DIR, `segment_${i}.mp4`);
    
    // FFmpeg-Befehl zum Trimmen eines Segments
    const args = [
      '-i', videoFile,
      '-ss', segment.startTime.toString(),
      '-t', segment.duration.toString(),
      '-c', 'copy',
      '-y',
      outputFile
    ];
    
    await runFFmpeg(args);
    trimmedFiles.push({
      file: outputFile,
      position: segment.position
    });
  }
  
  // 2. Sortiere Segmente nach Position
  trimmedFiles.sort((a, b) => a.position - b.position);
  
  // 3. Erstelle temporäre Dateiliste für Verkettung
  const concatFile = path.join(TEMP_DIR, 'concat.txt');
  const fileContents = trimmedFiles.map(item => 
    `file '${item.file.replace(/'/g, "'\\''")}'`
  ).join('\n');
  
  fs.writeFileSync(concatFile, fileContents);
  
  const concatenatedFile = path.join(OUTPUT_DIR, 'concatenated.mp4');
  
  // 4. Verkette die Segmente
  await runFFmpeg([
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-c', 'copy',
    '-y',
    concatenatedFile
  ]);
  
  // 5. Wenn ein Voiceover vorhanden ist, füge es hinzu
  if (voiceoverKey) {
    const voiceoverFile = inputFiles.find((_, index) => 
      INPUT_KEYS[index].includes(voiceoverKey)
    );
    
    if (!voiceoverFile) {
      throw new Error('Voiceover file not found');
    }
    
    const finalFile = path.join(OUTPUT_DIR, 'final.mp4');
    
    // FFmpeg-Befehl zum Hinzufügen des Voiceovers
    await runFFmpeg([
      '-i', concatenatedFile,
      '-i', voiceoverFile,
      '-map', '0:v', // Video vom ersten Input
      '-map', '1:a', // Audio vom zweiten Input
      '-c:v', 'copy',
      '-shortest',
      '-y',
      finalFile
    ]);
    
    return finalFile;
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
      output += data;
    });
    
    ffmpeg.stderr.on('data', (data) => {
      // FFmpeg schreibt den meisten Output auf stderr, auch wenn kein Fehler vorliegt
      console.log(data.toString());
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${output}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      reject(new Error(`Failed to start FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Lade die Ausgabedatei zu S3 hoch
 */
async function uploadOutputFile(filePath) {
  console.log(`Uploading output file to S3: ${OUTPUT_KEY}`);
  
  const fileStream = fs.createReadStream(filePath);
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: OUTPUT_KEY,
    Body: fileStream,
    ContentType: 'video/mp4'
  });
  
  await s3Client.send(command);
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
  
  console.log(`Sending callback to ${CALLBACK_URL}`);
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(callbackData);
    const url = new URL(CALLBACK_URL);
    
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
          reject(new Error(`Callback failed with status ${res.statusCode}: ${responseData}`));
        }
      });
    });
    
    req.on('error', (err) => {
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
  
  deleteFolderRecursive(TEMP_DIR);
}

// Starte die Hauptfunktion
main(); 