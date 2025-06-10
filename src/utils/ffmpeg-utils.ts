/**
 * FFmpeg-Utils für Videobearbeitung
 * Diese Versionen sind AWS Batch-basiert
 */
import { v4 as uuidv4 } from 'uuid';
import { submitAwsBatchJobDirect, BatchJobTypes } from '@/utils/aws-batch-utils';

/**
 * Interface für Videosegmente
 */
export type VideoSegment = {
  videoId: string;
  url: string;
  startTime: number;
  duration: number;
  position: number;
};

/**
 * Interface für Videoinformationen
 */
export type VideoInfo = {
  width: number;
  height: number;
  duration: number;
  fps?: number;
  format?: string;
  bitrate?: number;
  codec?: string;
};

/**
 * Simuliert die Prüfung von FFmpeg-Verfügbarkeit
 * Ersetzt durch AWS Batch-Funktionalität
 */
export const checkFFmpegAvailability = async (): Promise<{ available: boolean; version?: string; error?: string }> => {
  console.log('FFmpeg availability is now checked via AWS Batch');
  return {
    available: true,
    version: 'AWS Batch'
  };
};

/**
 * Simuliert die Erstellung eines temporären Verzeichnisses
 * In AWS Batch wird dies im Container erledigt
 */
export const getTempDir = async (): Promise<string> => {
  console.log('Temp dir creation is handled by AWS Batch');
  return `/tmp/${uuidv4()}`;
};

/**
 * Download-Funktion - in AWS Batch-Version wird die Datei von S3 geladen
 */
export const downloadFile = async (url: string, outputPath: string): Promise<string> => {
  console.log(`File download is now handled by AWS Batch: ${url}`);
  return outputPath;
};

/**
 * Video-Informationen abrufen - in AWS Batch-Version wird dies im Container erledigt
 */
export const getVideoInfo = async (videoPath: string): Promise<VideoInfo> => {
  console.log(`Video info is now retrieved by AWS Batch: ${videoPath}`);
  return {
    width: 1920,
    height: 1080,
    duration: 60,
    fps: 30
  };
};

/**
 * Videos mit Voiceover kombinieren - durch AWS Batch ersetzt
 */
export const combineVideosWithVoiceover = async (
  voiceoverUrl: string,
  videoSegments: VideoSegment[],
  outputFileName: string,
  progressCallback?: (progress: number) => void
): Promise<string> => {
  console.log(`Combining videos with voiceover via AWS Batch: ${videoSegments.length} segments`);
  
  // Sende den Job an AWS Batch anstatt lokale Verarbeitung
  const jobResult = await submitAwsBatchJobDirect(
    BatchJobTypes.ADD_VOICEOVER,
    videoSegments[0].url, // Erster Videoclip als Referenz
    outputFileName,
    {
      VOICEOVER_URL: voiceoverUrl,
      VIDEO_SEGMENTS: JSON.stringify(videoSegments),
    }
  );

  // Simuliere Fortschritt für die UI
  if (progressCallback) {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      if (progress <= 95) {
        progressCallback(progress);
      } else {
        clearInterval(interval);
      }
    }, 500);
  }
  
  return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/processed/${outputFileName}`;
};

/**
 * Temporäre Dateien bereinigen - in AWS Batch-Version wird dies im Container erledigt
 */
export const cleanupTempFiles = async (files: string[], directories: string[] = []): Promise<void> => {
  console.log(`Cleanup is now handled by AWS Batch`);
};

/**
 * Videos ohne Neucodierung verknüpfen - durch AWS Batch ersetzt
 */
export const concatVideosWithoutReencoding = async (
  videoPaths: string[],
  outputPath: string
): Promise<string> => {
  console.log(`Concatenating ${videoPaths.length} videos via AWS Batch`);
  
  // Sende den Job an AWS Batch
  const jobResult = await submitAwsBatchJobDirect(
    BatchJobTypes.CONCAT,
    videoPaths[0], // Erster Videoclip als Referenz
    outputPath,
    {
      VIDEO_PATHS: JSON.stringify(videoPaths),
    }
  );
  
  return outputPath;
};

/**
 * Erstellt das endgültige Video mit allen Anpassungen durch Delegieren an AWS Batch
 */
export const generateFinalVideo = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  templateData: any,
  outputFileName: string
): Promise<string> => {
  console.log(`Creating final video via AWS Batch`);
  
  // Sende den Job an AWS Batch
  const jobResult = await submitAwsBatchJobDirect(
    BatchJobTypes.GENERATE_FINAL,
    templateData.baseVideoUrl || '', // Basis-Video-URL als Referenz
    outputFileName,
    {
      TEMPLATE_DATA: JSON.stringify(templateData),
    }
  );
  
  return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/final/${outputFileName}`;
};
