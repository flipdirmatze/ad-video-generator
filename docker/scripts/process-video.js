#!/usr/bin/env node

/**
 * FFmpeg Video-Verarbeitungs-Skript für AWS Batch - SIMPLIFIED TEST VERSION
 * 
 * Dieses Skript wird in einem Docker-Container ausgeführt und verarbeitet Videos basierend
 * auf den Umgebungsvariablen, die von AWS Batch übergeben werden.
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

// Logge alle Umgebungsvariablen für Debugging (ohne sensible Daten)
console.log('Environment variables:');
Object.keys(process.env).forEach(key => {
  if (!['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'BATCH_CALLBACK_SECRET'].includes(key)) {
    if (key === 'TEMPLATE_DATA' && process.env[key]) {
      console.log(`${key}: (length: ${process.env[key].length})`);
    } else if (process.env[key] && process.env[key].length > 100) {
      console.log(`${key}: ${process.env[key].substring(0, 100)}... (truncated, length: ${process.env[key].length})`);
    } else {
      console.log(`${key}: ${process.env[key]}`);
    }
  } else {
    console.log(`${key}: ***REDACTED***`);
  }
});

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
    
    // Erstelle temporäre Verzeichnisse
    await createDirectories();
    
    // Einfacher Test: Erstelle eine leere Datei und lade sie hoch
    const testFilePath = path.join(OUTPUT_DIR, 'test.txt');
    fs.writeFileSync(testFilePath, 'This is a test file to verify S3 upload functionality.');
    
    console.log('Created test file:', testFilePath);
    console.log('File content:', fs.readFileSync(testFilePath, 'utf8'));
    
    // Lade die Testdatei zu S3 hoch
    await uploadTestFile(testFilePath);
    
    // Sende Callback für erfolgreichen Job
    await sendCallback({
      status: 'success',
      outputKey: OUTPUT_KEY,
      projectId: PROJECT_ID,
      message: 'Test file uploaded successfully'
    });
    
    console.log('Test completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error in test process:', error);
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
 * Lade eine Testdatei zu S3 hoch
 */
async function uploadTestFile(filePath) {
  console.log(`Uploading test file ${filePath} to S3 bucket ${S3_BUCKET}`);
  
  try {
    // Verify the file exists and has content
    if (!fs.existsSync(filePath)) {
      throw new Error(`Test file does not exist: ${filePath}`);
    }
    
    const fileStats = fs.statSync(filePath);
    console.log(`Test file size: ${fileStats.size} bytes`);
    
    const fileContent = fs.readFileSync(filePath);
    
    // Upload to a test location instead of the actual output key
    const testKey = `test/${path.basename(OUTPUT_KEY)}`;
    
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: testKey,
      Body: fileContent,
      ContentType: 'text/plain'
    });
    
    await s3Client.send(command);
    console.log(`Successfully uploaded test file to S3: s3://${S3_BUCKET}/${testKey}`);
  } catch (error) {
    console.error('Error uploading test file to S3:', error);
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

// Starte die Hauptfunktion
main(); 