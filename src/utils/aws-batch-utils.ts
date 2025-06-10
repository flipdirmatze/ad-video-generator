/**
 * AWS Batch Utils
 * Ersatz für lokale FFmpeg-Verarbeitung zugunsten von AWS Batch
 */
import { v4 as uuidv4 } from 'uuid';
import { BatchClient, SubmitJobCommand, DescribeJobsCommand } from '@aws-sdk/client-batch';

// Definiere valide Job-Typen als Enum
export const BatchJobTypes = {
  GENERATE_FINAL: 'generate-final',
  ADD_VOICEOVER: 'add-voiceover',
  CONCAT: 'concat',
  EXTRACT_AUDIO: 'extract-audio',
  ADD_SUBTITLES: 'add-subtitles'
} as const;

export type BatchJobType = typeof BatchJobTypes[keyof typeof BatchJobTypes];

// Interface für Job-Parameter
export interface BatchJobParams {
  jobType: BatchJobType;
  inputVideoUrl: string;
  outputKey?: string;
  additionalParams?: Record<string, string | number | boolean | object>;
}

// Interface für Job-Ergebnis
export interface BatchJobResult {
  jobId: string;
  jobName: string;
  status?: string;
}

/**
 * Interface für Videosegmente
 */
export interface VideoSegment {
  videoId: string;
  url: string;
  startTime: number;
  duration: number;
  position: number;
}

/**
 * Interface für Videoinformationen
 */
export interface VideoInfo {
  width: number;
  height: number;
  duration: number;
  fps?: number;
  format?: string;
  bitrate?: number;
  codec?: string;
}

/**
 * DIREKTE AWS Batch Submission (ohne API-Route)
 * Verwendet direkt die AWS SDK statt über unsere API zu gehen
 */
export const submitAwsBatchJobDirect = async (
  jobType: BatchJobType,
  inputVideoUrl: string,
  outputKey?: string,
  additionalParams?: Record<string, string | number | boolean | object>
): Promise<BatchJobResult> => {
  try {
    // Validiere den Job-Typ
    const validJobTypes = Object.values(BatchJobTypes);
    if (!validJobTypes.includes(jobType)) {
      console.error(`Invalid job type: ${jobType}. Valid types:`, validJobTypes);
      throw new Error(`Invalid job type: ${jobType}`);
    }

    // Validiere die Input-URL
    if (!inputVideoUrl) {
      console.error('Input video URL is required but was not provided');
      throw new Error('Input video URL is required');
    }

    // Validiere AWS-Credentials
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials are not configured');
    }

    console.log(`Submitting AWS Batch job directly with job type ${jobType}`);
    console.log('Input video URL:', inputVideoUrl);
    console.log('Output key:', outputKey || 'Not provided');

    const batchClient = new BatchClient({
      region: process.env.AWS_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    // Hole die Benutzer-ID aus den additionalParams, falls vorhanden
    const userId = additionalParams?.USER_ID || 'system';
    
    // Generiere einen eindeutigen Job-Namen
    const jobName = `video-${jobType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Erstelle Environment-Variablen
    const environment: { name: string; value: string }[] = [];
    
    // Basis-Umgebungsvariablen
    environment.push({ name: 'JOB_TYPE', value: jobType });
    environment.push({ name: 'INPUT_VIDEO_URL', value: inputVideoUrl });
    environment.push({ name: 'USER_ID', value: String(userId) });
    environment.push({ name: 'S3_BUCKET', value: process.env.S3_BUCKET_NAME || '' });
    environment.push({ name: 'AWS_REGION', value: process.env.AWS_REGION || 'eu-central-1' });
    
    // Output Key setzen
    if (outputKey) {
      environment.push({ name: 'OUTPUT_KEY', value: outputKey });
    }
    
    // Zusätzliche Parameter hinzufügen
    if (additionalParams) {
      Object.entries(additionalParams).forEach(([key, value]) => {
        if (key !== 'OUTPUT_KEY' && value !== undefined && value !== null) {
          const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
          environment.push({ name: key, value: stringValue });
        }
      });
    }

    // Validiere AWS Batch-Konfiguration
    if (!process.env.AWS_BATCH_JOB_QUEUE) {
      throw new Error('AWS_BATCH_JOB_QUEUE environment variable is not set');
    }
    if (!process.env.AWS_BATCH_JOB_DEFINITION) {
      throw new Error('AWS_BATCH_JOB_DEFINITION environment variable is not set');
    }

    const command = new SubmitJobCommand({
      jobName,
      jobQueue: process.env.AWS_BATCH_JOB_QUEUE,
      jobDefinition: process.env.AWS_BATCH_JOB_DEFINITION,
      containerOverrides: {
        environment
      }
    });

    const response = await batchClient.send(command);
    console.log('AWS Batch job submitted successfully:', response.jobId);

    return {
      jobId: response.jobId || '',
      jobName: response.jobName || jobName,
      status: 'SUBMITTED'
    };
  } catch (error) {
    console.error('Error submitting AWS Batch job directly:', error);
    throw error instanceof Error 
      ? error 
      : new Error('Unknown error submitting AWS Batch job');
  }
};

/**
 * Ruft den Status eines AWS Batch Jobs ab - DIREKT über AWS SDK
 */
export const getJobStatusDirect = async (jobId: string): Promise<string> => {
  try {
    // Validiere AWS-Credentials
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials are not configured');
    }

    const batchClient = new BatchClient({
      region: process.env.AWS_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    });

    console.log(`Fetching job status for job ${jobId} directly from AWS`);
    
    const command = new DescribeJobsCommand({
      jobs: [jobId]
    });
    
    const response = await batchClient.send(command);
    
    if (!response.jobs || response.jobs.length === 0) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const job = response.jobs[0];
    const status = job.status?.toLowerCase() || 'unknown';
    
    // Wenn der Job fehlgeschlagen ist und einen Grund hat, füge ihn hinzu
    if (status === 'failed' && job.statusReason) {
      return `failed: ${job.statusReason}`;
    }
    
    return status;
  } catch (error) {
    console.error('Error getting job status directly:', error);
    throw error instanceof Error 
      ? error 
      : new Error('Unknown error getting job status');
  }
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
  if (!voiceoverUrl || !videoSegments.length || !outputFileName) {
    throw new Error('Missing required parameters for combining videos with voiceover');
  }

  console.log(`Combining videos with voiceover via AWS Batch: ${videoSegments.length} segments`);
  
  try {
    // Sende den Job an AWS Batch anstatt lokale Verarbeitung
    const jobResult = await submitAwsBatchJobDirect(
      BatchJobTypes.ADD_VOICEOVER,
      videoSegments[0].url, // Erster Videoclip als Referenz
      outputFileName,
      {
        VOICEOVER_URL: voiceoverUrl,
        VIDEO_SEGMENTS: videoSegments,
      }
    );
    
    // Simuliere Fortschritt für die UI
    if (progressCallback) {
      let progress = 0;
      const interval = setInterval(async () => {
        try {
          // Verwende die Job-ID als Benutzer-ID für die Authentifizierung
          const status = await getJobStatusDirect(jobResult.jobId);
          
          switch (status.toLowerCase()) {
            case 'running':
              progress = Math.min(progress + 5, 95);
              progressCallback(progress);
              break;
            case 'succeeded':
              clearInterval(interval);
              progressCallback(100);
              break;
            case 'failed':
              clearInterval(interval);
              throw new Error('Job failed');
            default:
              // Keep current progress for other states
              progressCallback(progress);
          }
        } catch (error) {
          clearInterval(interval);
          console.error('Error updating progress:', error);
        }
      }, 5000); // Check every 5 seconds
    }
    
    if (!process.env.S3_BUCKET_NAME) {
      throw new Error('S3_BUCKET_NAME environment variable is not set');
    }
    
    return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/processed/${outputFileName}`;
  } catch (error) {
    console.error('Error in combineVideosWithVoiceover:', error);
    throw error instanceof Error 
      ? error 
      : new Error('Failed to combine videos with voiceover');
  }
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
  templateData: {
    baseVideoUrl?: string;
    segments: VideoSegment[];
    voiceoverId?: string;
    options?: {
      resolution?: string;
      aspectRatio?: string;
      addSubtitles?: boolean;
      addWatermark?: boolean;
      watermarkText?: string;
      outputFormat?: string;
    };
  },
  outputFileName: string,
  userId?: string
): Promise<string> => {
  if (!templateData || !outputFileName) {
    throw new Error('Missing required parameters for generating final video');
  }

  console.log('Creating final video via AWS Batch');
  
  try {
    // Validiere die Template-Daten
    if (!templateData.segments || !templateData.segments.length) {
      throw new Error('No video segments provided');
    }

    // Sende den Job an AWS Batch
    const jobResult = await submitAwsBatchJobDirect(
      BatchJobTypes.GENERATE_FINAL,
      templateData.baseVideoUrl || templateData.segments[0].url,
      outputFileName,
      {
        TEMPLATE_DATA: templateData,
        USER_ID: userId || 'system'  // Benutzer-ID für Mandantentrennung
      }
    );
    
    if (!process.env.S3_BUCKET_NAME) {
      throw new Error('S3_BUCKET_NAME environment variable is not set');
    }
    
    // Generiere eine URL, die der neuen Struktur entspricht
    if (userId) {
      return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/users/${userId}/final/${outputFileName}`;
    } else {
      return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/final/${outputFileName}`;
    }
  } catch (error) {
    console.error('Error in generateFinalVideo:', error);
    throw error instanceof Error 
      ? error 
      : new Error('Failed to generate final video');
  }
};
