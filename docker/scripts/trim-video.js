#!/usr/bin/env node

const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Konfiguration
const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const VIDEO_ID = process.env.VIDEO_ID;
const INPUT_PATH = process.env.INPUT_PATH;
const START_TIME = process.env.START_TIME;
const END_TIME = process.env.END_TIME;

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' });
const TEMP_DIR = '/tmp/trimming';

// Mongoose Schema und Model (vereinfacht)
const VideoSchema = new mongoose.Schema({
  id: String,
  path: String,
  status: String,
  name: String,
  originalPath: String,
  size: Number
});
const VideoModel = mongoose.model('Video', VideoSchema);

async function main() {
  console.log('--- Starting Video Trim Job ---');
  console.log(`- Video ID: ${VIDEO_ID}`);
  console.log(`- Input Path: s3://${BUCKET_NAME}/${INPUT_PATH}`);
  console.log(`- Time Range: ${START_TIME}s - ${END_TIME}s`);

  try {
    // Verzeichnisse erstellen
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    // 1. Quelldatei von S3 herunterladen
    const localInputPath = path.join(TEMP_DIR, path.basename(INPUT_PATH));
    console.log(`Downloading ${INPUT_PATH} to ${localInputPath}...`);
    const getObjectParams = {
      Bucket: BUCKET_NAME,
      Key: INPUT_PATH,
    };
    const { Body: inputFileStream } = await s3Client.send(new GetObjectCommand(getObjectParams));
    await fs.promises.writeFile(localInputPath, inputFileStream);
    console.log('Download complete.');

    // 2. Video mit FFmpeg schneiden (Stream Copy für Geschwindigkeit)
    const fileExtension = path.extname(INPUT_PATH);
    const localOutputPath = path.join(TEMP_DIR, `trimmed-${VIDEO_ID}${fileExtension}`);
    const duration = parseFloat(END_TIME) - parseFloat(START_TIME);
    
    // FFmpeg-Befehl: -ss für Startzeit, -t für Dauer, -c copy für schnelles Schneiden ohne Neukodierung
    const ffmpegCommand = `ffmpeg -ss ${START_TIME} -i "${localInputPath}" -t ${duration} -c copy "${localOutputPath}"`;

    console.log(`Executing FFmpeg: ${ffmpegCommand}`);
    execSync(ffmpegCommand, { stdio: 'inherit' });
    console.log('FFmpeg trimming complete.');
    
    // 3. Geschnittene Datei nach S3 hochladen
    // Der neue Pfad ist im 'processed' Ordner, um ihn vom Original zu trennen
    const outputKey = `processed/${VIDEO_ID}-trimmed${fileExtension}`;
    console.log(`Uploading ${localOutputPath} to s3://${BUCKET_NAME}/${outputKey}...`);
    
    const putObjectParams = {
      Bucket: BUCKET_NAME,
      Key: outputKey,
      Body: fs.createReadStream(localOutputPath),
      ContentType: `video/${fileExtension.substring(1)}`,
    };
    await s3Client.send(new PutObjectCommand(putObjectParams));
    console.log('Upload of trimmed video complete.');

    // 4. Datenbankeintrag aktualisieren
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to database.');

    const newSize = fs.statSync(localOutputPath).size;

    await VideoModel.findOneAndUpdate(
      { id: VIDEO_ID },
      { 
        status: 'complete',
        path: outputKey, // Pfad auf die neue, geschnittene Datei aktualisieren
        originalPath: INPUT_PATH, // Originalpfad für Referenz speichern
        size: newSize
      },
      { new: true }
    );
    console.log('Database record updated successfully.');
    await mongoose.disconnect();

    // Optional: Originaldatei löschen, um Speicherplatz zu sparen
    // const deleteParams = { Bucket: BUCKET_NAME, Key: INPUT_PATH };
    // await s3Client.send(new DeleteObjectCommand(deleteParams));
    // console.log(`Deleted original file: ${INPUT_PATH}`);

    console.log('--- Video Trim Job Finished Successfully ---');
  } catch (error) {
    console.error('--- Video Trim Job Failed ---');
    console.error(error);
    // Optional: Status in der DB auf 'failed' setzen
    process.exit(1);
  } finally {
    // Temporäre Dateien löschen
    if (fs.existsSync(TEMP_DIR)) {
      fs.rmSync(TEMP_DIR, { recursive: true, force: true });
      console.log('Cleaned up temp directory.');
    }
  }
}

main(); 