const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const s3Client = new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' });

/**
 * AWS Lambda Handler für Video-Trimming mit echtem FFmpeg
 * 
 * Event-Format:
 * {
 *   videoId: string,
 *   inputPath: string,
 *   startTime: number,
 *   endTime: number
 * }
 */
exports.handler = async (event) => {
  console.log('Lambda Video Trimmer started with event:', JSON.stringify(event, null, 2));
  
  const { videoId, inputPath, startTime, endTime } = event;
  const BUCKET_NAME = process.env.S3_BUCKET_NAME;
  const TEMP_DIR = '/tmp';
  
  // Unique ID für temporäre Dateien
  const jobId = `trim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const localInputPath = path.join(TEMP_DIR, `input-${jobId}.mp4`);
  const localOutputPath = path.join(TEMP_DIR, `output-${jobId}.mp4`);

  try {
    console.log(`Processing video ${videoId}: ${startTime}s to ${endTime}s`);

    // 1. Video von S3 herunterladen
    console.log(`Downloading ${inputPath} from S3...`);
    const getObjectParams = { Bucket: BUCKET_NAME, Key: inputPath };
    const { Body } = await s3Client.send(new GetObjectCommand(getObjectParams));
    
    // Stream zu Datei schreiben
    const chunks = [];
    for await (const chunk of Body) {
      chunks.push(chunk);
    }
    fs.writeFileSync(localInputPath, Buffer.concat(chunks));
    console.log('Download complete.');

    // 2. Video mit FFmpeg schneiden
    const duration = parseFloat(endTime) - parseFloat(startTime);
    const fileExtension = path.extname(inputPath);
    
    // FFmpeg-Befehl für schnelles Schneiden ohne Neukodierung
    // /opt/bin/ffmpeg ist der Pfad zum FFmpeg-Binary im Layer
    const ffmpegCommand = `/opt/bin/ffmpeg -ss ${startTime} -i "${localInputPath}" -t ${duration} -c copy "${localOutputPath}" -y`;
    
    console.log(`Executing: ${ffmpegCommand}`);
    execSync(ffmpegCommand, { stdio: ['pipe', 'pipe', 'pipe'] });
    console.log('FFmpeg trimming complete.');
    
    // 3. Geschnittenes Video nach S3 hochladen
    const outputKey = `processed/${videoId}-trimmed${fileExtension}`;
    console.log(`Uploading trimmed video to ${outputKey}...`);
    
    const fileBuffer = fs.readFileSync(localOutputPath);
    const putObjectParams = {
      Bucket: BUCKET_NAME,
      Key: outputKey,
      Body: fileBuffer,
      ContentType: `video/${fileExtension.substring(1)}`
    };
    
    await s3Client.send(new PutObjectCommand(putObjectParams));
    console.log('Upload complete.');

    // 4. Datenbank aktualisieren
    console.log('Updating database...');
    const mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    
    const db = mongoClient.db();
    const collection = db.collection('videos');
    
    const newSize = fs.statSync(localOutputPath).size;
    
    const updateResult = await collection.updateOne(
      { id: videoId },
      { 
        $set: {
          status: 'complete',
          path: outputKey,
          originalPath: inputPath,
          size: newSize,
          trimmedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    await mongoClient.close();
    console.log(`Database updated. Matched: ${updateResult.matchedCount}, Modified: ${updateResult.modifiedCount}`);

    // 5. Temporäre Dateien löschen
    try {
      fs.unlinkSync(localInputPath);
      fs.unlinkSync(localOutputPath);
      console.log('Temporary files cleaned up.');
    } catch (cleanupError) {
      console.warn('Cleanup warning:', cleanupError.message);
    }

    console.log(`Video trimming completed successfully for ${videoId}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        videoId,
        outputKey,
        message: 'Video trimmed successfully with FFmpeg'
      })
    };

  } catch (error) {
    console.error('Lambda function error:', error);
    
    // Bei Fehlern: Video-Status auf 'failed' setzen
    try {
      const mongoClient = new MongoClient(process.env.MONGODB_URI);
      await mongoClient.connect();
      
      const db = mongoClient.db();
      const collection = db.collection('videos');
      
      await collection.updateOne(
        { id: videoId },
        { 
          $set: {
            status: 'failed',
            error: error.message,
            updatedAt: new Date()
          }
        }
      );
      
      await mongoClient.close();
      console.log('Video status set to failed in database.');
    } catch (dbError) {
      console.error('Failed to update database with error status:', dbError);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        videoId
      })
    };
  }
}; 