import { spawn } from 'child_process';
import { getSignedDownloadUrl, uploadToS3 } from './storage';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/prisma';
import os from 'os';
import fetch from 'node-fetch';

export async function processVideo(data: any) {
  const { projectId, userId, segments, voiceoverUrl } = data;
  const tempDir = path.join(os.tmpdir(), `video-project-${projectId}`);
  
  try {
    // Update project status
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'PROCESSING' }
    });
    
    // Verzeichnis sicherstellen und bereinigen
    await fs.ensureDir(tempDir);
    
    console.log(`[Job ${projectId}] Temporäres Verzeichnis erstellt: ${tempDir}`);
    
    // Download voiceover from S3
    const voiceoverPath = path.join(tempDir, 'voiceover.mp3');
    const voiceoverKey = voiceoverUrl.replace(/^https:\/\/.*\.amazonaws\.com\//, '');
    const voiceoverSignedUrl = await getSignedDownloadUrl(voiceoverKey);
    
    console.log(`[Job ${projectId}] Voiceover URL generiert, beginne Download`);
    
    // Download voiceover file
    const voiceoverResponse = await fetch(voiceoverSignedUrl);
    if (!voiceoverResponse.ok) {
      throw new Error(`Failed to download voiceover: ${voiceoverResponse.statusText}`);
    }
    const voiceoverBuffer = Buffer.from(await voiceoverResponse.arrayBuffer());
    await fs.writeFile(voiceoverPath, voiceoverBuffer);
    
    console.log(`[Job ${projectId}] Voiceover heruntergeladen nach ${voiceoverPath}`);
    
    // Download and process each video segment
    const videoSegments = [];
    for (const segment of segments) {
      console.log(`[Job ${projectId}] Verarbeite Segment für Video ${segment.videoId}`);
      
      // Get video from database
      const video = await prisma.video.findUnique({
        where: { id: segment.videoId }
      });
      
      if (!video) {
        throw new Error(`Video with ID ${segment.videoId} not found`);
      }
      
      // Download video
      const videoPath = path.join(tempDir, `video-${segment.videoId}.mp4`);
      const videoKey = video.url.replace(/^https:\/\/.*\.amazonaws\.com\//, '');
      const videoSignedUrl = await getSignedDownloadUrl(videoKey);
      
      console.log(`[Job ${projectId}] Video URL generiert, beginne Download für ${segment.videoId}`);
      
      const videoResponse = await fetch(videoSignedUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to download video: ${videoResponse.statusText}`);
      }
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
      await fs.writeFile(videoPath, videoBuffer);
      
      console.log(`[Job ${projectId}] Video heruntergeladen nach ${videoPath}`);
      
      // Create trimmed segment
      const trimmedPath = path.join(tempDir, `segment-${segment.position}.mp4`);
      await trimVideo(videoPath, trimmedPath, segment.startTime, segment.duration);
      
      console.log(`[Job ${projectId}] Segment ${segment.position} zugeschnitten: ${trimmedPath}`);
      
      videoSegments.push({
        path: trimmedPath,
        position: segment.position
      });
    }
    
    // Sort segments by position
    videoSegments.sort((a, b) => a.position - b.position);
    
    // Create concat file for ffmpeg
    const concatFilePath = path.join(tempDir, 'concat.txt');
    const concatContent = videoSegments.map(seg => `file '${seg.path}'`).join('\n');
    await fs.writeFile(concatFilePath, concatContent);
    
    console.log(`[Job ${projectId}] Concat-Datei erstellt: ${concatFilePath}`);
    
    // Combine all segments
    const combinedVideoPath = path.join(tempDir, 'combined.mp4');
    await combineSegments(concatFilePath, combinedVideoPath);
    
    console.log(`[Job ${projectId}] Videos kombiniert: ${combinedVideoPath}`);
    
    // Add voiceover
    const outputPath = path.join(tempDir, `final-${uuidv4()}.mp4`);
    await addVoiceover(combinedVideoPath, voiceoverPath, outputPath);
    
    console.log(`[Job ${projectId}] Voiceover hinzugefügt: ${outputPath}`);
    
    // Upload result to S3
    const finalVideoBuffer = await fs.readFile(outputPath);
    const outputFileName = path.basename(outputPath);
    const finalVideoUrl = await uploadToS3(finalVideoBuffer, outputFileName, 'video/mp4');
    
    console.log(`[Job ${projectId}] Finales Video hochgeladen: ${finalVideoUrl}`);
    
    // Update project
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'COMPLETED',
        outputUrl: finalVideoUrl
      }
    });
    
    console.log(`[Job ${projectId}] Projekt erfolgreich aktualisiert`);
    
    // Clean up
    await fs.remove(tempDir);
    console.log(`[Job ${projectId}] Temporäre Dateien bereinigt`);
    
    return { success: true, videoUrl: finalVideoUrl };
  } catch (error) {
    console.error(`[Job ${projectId}] Fehler bei der Videoverarbeitung:`, error);
    
    // Update project with error
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error)
      }
    });
    
    // Clean up on error
    try {
      await fs.remove(tempDir);
      console.log(`[Job ${projectId}] Temporäre Dateien nach Fehler bereinigt`);
    } catch (cleanupError) {
      console.error(`[Job ${projectId}] Fehler beim Bereinigen:`, cleanupError);
    }
    
    throw error;
  }
}

// Hilfsfunktionen für FFmpeg-Operationen
async function trimVideo(inputPath: string, outputPath: string, startTime: number, duration: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',                             // Überschreibe ohne Nachfrage
      '-i', inputPath,                  // Eingabedatei
      '-ss', startTime.toString(),      // Startzeit
      '-t', duration.toString(),        // Dauer
      '-c', 'copy',                     // Kopiere Codecs (schneller)
      outputPath                        // Ausgabedatei
    ]);

    ffmpeg.stderr.on('data', (data) => {
      console.log(`FFmpeg (trim): ${data.toString()}`);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

async function combineSegments(concatFile: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',                             // Überschreibe ohne Nachfrage
      '-f', 'concat',                   // Concat format
      '-safe', '0',                     // Erlaube unsichere Dateinamen
      '-i', concatFile,                 // Eingabedatei (Liste)
      '-c', 'copy',                     // Kopiere Codecs
      outputPath                        // Ausgabedatei
    ]);

    ffmpeg.stderr.on('data', (data) => {
      console.log(`FFmpeg (concat): ${data.toString()}`);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

async function addVoiceover(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y',                             // Überschreibe ohne Nachfrage
      '-i', videoPath,                  // Video-Eingabe
      '-i', audioPath,                  // Audio-Eingabe
      '-map', '0:v',                    // Verwende Video vom ersten Input
      '-map', '1:a',                    // Verwende Audio vom zweiten Input
      '-c:v', 'copy',                   // Video-Codec kopieren
      '-shortest',                      // Auf kürzeste Länge begrenzen
      outputPath                        // Ausgabedatei
    ]);

    ffmpeg.stderr.on('data', (data) => {
      console.log(`FFmpeg (voiceover): ${data.toString()}`);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
} 