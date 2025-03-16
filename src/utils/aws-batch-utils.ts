/**
 * AWS Batch Utils
 * Ersatz für lokale FFmpeg-Verarbeitung zugunsten von AWS Batch
 */
import { v4 as uuidv4 } from 'uuid';

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
 * Ruft die AWS Batch API auf, um einen Videoverarbeitungsjob einzureichen
 */
export const submitAwsBatchJob = async (
  jobType: BatchJobType,
  inputVideoUrl: string,
  outputKey?: string,
  additionalParams?: Record<string, string | number | boolean | object>
): Promise<BatchJobResult> => {
  // Bestimme die Basis-URL für API-Aufrufe (nur Server-seitig)
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://ad-video-generator.vercel.app').replace(/\/+$/, '');

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

    console.log(`Submitting AWS Batch job to ${baseUrl}/api/aws-batch with job type ${jobType}`);
    console.log('Input video URL:', inputVideoUrl);
    console.log('Output key:', outputKey || 'Not provided');
    
    // Hole die Benutzer-ID aus den additionalParams, falls vorhanden
    const userId = additionalParams?.USER_ID || 'system';
    
    // Erstelle die Anfrage an unsere API-Route
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.API_SECRET_KEY || 'internal-api-call',
        'Authorization': `Bearer ${userId}`
      },
      body: JSON.stringify({
        jobType,
        inputVideoUrl,
        outputKey,
        additionalParams,
      } as BatchJobParams),
      // Erhöhe das Timeout für die Anfrage
      signal: AbortSignal.timeout(30000) // 30 Sekunden Timeout
    };
    
    console.log('Sending request to AWS Batch API with options:', {
      url: `${baseUrl}/api/aws-batch`,
      method: requestOptions.method,
      headers: {
        'Content-Type': requestOptions.headers['Content-Type'],
        'x-api-key': requestOptions.headers['x-api-key'],
        'Authorization': 'Bearer [userId]' // Maskiere die tatsächliche ID im Log
      },
      bodyLength: requestOptions.body.length
    });
    
    const response = await fetch(`${baseUrl}/api/aws-batch`, requestOptions);

    console.log('AWS Batch API response status:', response.status);
    
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
        console.error('AWS Batch API error response:', errorData);
      } catch (parseError) {
        console.error('Failed to parse error response:', parseError);
        errorData = { error: 'Unknown error', status: response.status };
      }
      
      throw new Error(
        `AWS Batch API error: ${errorData.error || errorData.message || response.statusText} (Status: ${response.status})`
      );
    }

    let data;
    try {
      data = await response.json();
      console.log('AWS Batch API success response:', data);
    } catch (parseError) {
      console.error('Failed to parse success response:', parseError);
      throw new Error('Failed to parse response from AWS Batch API');
    }
    
    if (!data.jobId || !data.jobName) {
      console.error('Invalid response from AWS Batch API:', data);
      throw new Error('Invalid response from AWS Batch API: Missing jobId or jobName');
    }

    return {
      jobId: data.jobId,
      jobName: data.jobName,
      status: data.status
    };
  } catch (error) {
    console.error('Error submitting AWS Batch job:', error);
    throw error instanceof Error 
      ? error 
      : new Error('Unknown error submitting AWS Batch job');
  }
};

/**
 * Ruft den Status eines AWS Batch Jobs ab
 */
export const getJobStatus = async (jobId: string, userId?: string): Promise<string> => {
  // Bestimme die Basis-URL für API-Aufrufe (nur Server-seitig)
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://ad-video-generator.vercel.app').replace(/\/+$/, '');

  try {
    console.log(`Fetching job status for job ${jobId} from ${baseUrl}/api/aws-batch`);
    
    // Verwende die übergebene Benutzer-ID oder 'system' als Fallback
    const authUserId = userId || 'system';
    
    const response = await fetch(
      `${baseUrl}/api/aws-batch?jobId=${jobId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.API_SECRET_KEY || 'internal-api-call',
          'Authorization': `Bearer ${authUserId}`
        },
        // Erhöhe das Timeout für die Anfrage
        signal: AbortSignal.timeout(30000) // 30 Sekunden Timeout
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `Failed to get job status: ${errorData.error || errorData.message || response.statusText}`
      );
    }

    const data = await response.json();
    return data.status;
  } catch (error) {
    console.error('Error getting job status:', error);
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
    const jobResult = await submitAwsBatchJob(
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
          const status = await getJobStatus(jobResult.jobId, jobResult.jobId);
          
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
  const jobResult = await submitAwsBatchJob(
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
  outputFileName: string
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
    const jobResult = await submitAwsBatchJob(
      BatchJobTypes.GENERATE_FINAL,
      templateData.baseVideoUrl || templateData.segments[0].url,
      outputFileName,
      {
        TEMPLATE_DATA: templateData,
      }
    );
    
    if (!process.env.S3_BUCKET_NAME) {
      throw new Error('S3_BUCKET_NAME environment variable is not set');
    }
    
    return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/final/${outputFileName}`;
  } catch (error) {
    console.error('Error in generateFinalVideo:', error);
    throw error instanceof Error 
      ? error 
      : new Error('Failed to generate final video');
  }
};
