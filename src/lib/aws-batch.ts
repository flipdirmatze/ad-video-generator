import { BatchClient, SubmitJobCommand } from '@aws-sdk/client-batch';

// AWS Batch Client mit Konfiguration aus Umgebungsvariablen
const batchClient = new BatchClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * Verschiedene Typen von Videoverarbeitungsjobs
 */
export type JobType = 'trim' | 'concat' | 'voiceover' | 'complete';

/**
 * Parameter für einen Trim-Job (Videoschnitt)
 */
export type TrimJobParams = {
  startTime: number; // in Sekunden
  duration: number; // in Sekunden
};

/**
 * Segment-Definition für einen Concatenate-Job (Videos zusammenfügen)
 */
export type VideoSegmentParams = {
  videoKey: string; // S3-Key des Videos
  startTime: number; // in Sekunden
  duration: number; // in Sekunden
  position: number; // Position in der Sequenz
};

/**
 * Parameter für einen Job, der ein Voiceover zu einem Video hinzufügt
 */
export type VoiceoverJobParams = {
  videoKey: string; // S3-Key des Videos
  voiceoverKey: string; // S3-Key des Voiceovers
};

/**
 * Parameter für einen kompletten Video-Generierungs-Job (alles auf einmal)
 */
export type CompleteJobParams = {
  segments: VideoSegmentParams[]; // Video-Segmente
  voiceoverKey?: string; // Optionales Voiceover
};

/**
 * Mögliche Parameter für verschiedene Jobtypen
 */
export type JobParams = 
  | TrimJobParams 
  | VideoSegmentParams[] 
  | VoiceoverJobParams 
  | CompleteJobParams;

/**
 * Konfiguration für einen Videoverarbeitungsjob
 */
export type VideoProcessingJob = {
  jobType: JobType;
  inputs: string[]; // S3-Keys der Eingabevideos
  outputKey: string; // S3-Key für die Ausgabe
  params?: JobParams; // Job-spezifische Parameter
};

/**
 * Sendet einen Videoverarbeitungsjob an AWS Batch
 */
export async function submitVideoProcessingJob(
  jobData: VideoProcessingJob,
  userId: string
) {
  // Eindeutigen Job-Namen generieren
  const jobName = `video-${jobData.jobType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  // Container-Überrides, um die Jobparameter an den Container zu übergeben
  const containerOverrides = {
    environment: [
      { name: 'JOB_TYPE', value: jobData.jobType },
      { name: 'INPUT_KEYS', value: JSON.stringify(jobData.inputs) },
      { name: 'OUTPUT_KEY', value: jobData.outputKey },
      { name: 'USER_ID', value: userId },
      { name: 'JOB_PARAMS', value: JSON.stringify(jobData.params || {}) },
      { name: 'S3_BUCKET', value: process.env.S3_BUCKET_NAME! },
      { name: 'AWS_REGION', value: process.env.AWS_REGION! },
    ],
  };

  // AWS Batch Job-Definition und Queue aus Umgebungsvariablen
  const jobDefinition = process.env.AWS_BATCH_JOB_DEFINITION!;
  const jobQueue = process.env.AWS_BATCH_JOB_QUEUE!;

  if (!jobDefinition || !jobQueue) {
    throw new Error('AWS Batch-Konfiguration fehlt: JOB_DEFINITION oder JOB_QUEUE nicht definiert');
  }

  // Job-Kommando vorbereiten
  const command = new SubmitJobCommand({
    jobName,
    jobQueue,
    jobDefinition,
    containerOverrides,
  });

  try {
    // Job an AWS Batch senden
    const response = await batchClient.send(command);
    
    console.log(`AWS Batch Job gestartet: ${response.jobId} (${jobName})`);
    
    return {
      jobId: response.jobId,
      jobName,
    };
  } catch (error) {
    console.error('Fehler beim Starten des AWS Batch Jobs:', error);
    throw error;
  }
}

/**
 * Startet einen AWS Batch Job, um ein Video zuzuschneiden.
 * Dieser Job ist für eine schnelle Verarbeitung optimiert (Stream Copy).
 *
 * @param {object} params - Die Parameter für den Trimm-Job.
 * @param {string} params.videoId - Die ID des Videos in der Datenbank.
 * @param {string} params.inputPath - Der S3-Key des Originalvideos.
 * @param {number} params.startTime - Die Startzeit für den Schnitt in Sekunden.
 * @param {number} params.endTime - Die Endzeit für den Schnitt in Sekunden.
 * @returns {Promise<object>} - Die Job-ID und der Job-Name.
 */
export async function startVideoTrimJob({
  videoId,
  inputPath,
  startTime,
  endTime
}: {
  videoId: string;
  inputPath: string;
  startTime: number;
  endTime: number;
}) {
  const jobName = `video-trim-${videoId}-${Date.now()}`;

  // Die Umgebungsvariablen werden direkt an den Container übergeben.
  const containerOverrides = {
    environment: [
      { name: 'JOB_TYPE', value: 'trim-video' },
      { name: 'VIDEO_ID', value: videoId },
      { name: 'INPUT_PATH', value: inputPath },
      { name: 'START_TIME', value: String(startTime) },
      { name: 'END_TIME', value: String(endTime) },
      { name: 'S3_BUCKET_NAME', value: process.env.S3_BUCKET_NAME! },
    ],
  };

  // Spezifische Job-Definition und Queue für das schnelle Trimming
  // Diese müssen in der `terraform/main.tf` oder AWS-Konsole erstellt werden.
  const jobDefinition = process.env.AWS_BATCH_TRIM_JOB_DEFINITION!;
  const jobQueue = process.env.AWS_BATCH_TRIM_JOB_QUEUE!;

  if (!jobDefinition || !jobQueue) {
    throw new Error('AWS Batch Trimming-Konfiguration fehlt: JOB_DEFINITION oder JOB_QUEUE nicht definiert');
  }

  const command = new SubmitJobCommand({
    jobName,
    jobQueue,
    jobDefinition,
    containerOverrides,
  });

  try {
    const response = await batchClient.send(command);
    console.log(`Video Trim Job gestartet: ${response.jobId} für Video ${videoId}`);
    return {
      jobId: response.jobId,
      jobName,
    };
  } catch (error) {
    console.error(`Fehler beim Starten des Video Trim Jobs für ${videoId}:`, error);
    throw error;
  }
}

/**
 * Hilfsfunktion, um ein Video mit FFmpeg zu trimmen
 */
export function createTrimJob(
  videoKey: string,
  outputKey: string,
  startTime: number,
  duration: number,
  userId: string
) {
  return submitVideoProcessingJob(
    {
      jobType: 'trim',
      inputs: [videoKey],
      outputKey,
      params: {
        startTime,
        duration,
      },
    },
    userId
  );
}

/**
 * Hilfsfunktion, um mehrere Videos zu concatenieren
 */
export function createConcatJob(
  videoKeys: string[],
  outputKey: string,
  userId: string
) {
  return submitVideoProcessingJob(
    {
      jobType: 'concat',
      inputs: videoKeys,
      outputKey,
    },
    userId
  );
}

/**
 * Hilfsfunktion, um ein Voiceover zu einem Video hinzuzufügen
 */
export function createVoiceoverJob(
  videoKey: string,
  voiceoverKey: string,
  outputKey: string,
  userId: string
) {
  return submitVideoProcessingJob(
    {
      jobType: 'voiceover',
      inputs: [videoKey],
      outputKey,
      params: {
        videoKey,
        voiceoverKey,
      },
    },
    userId
  );
}

/**
 * Hilfsfunktion, um einen kompletten Video-Generierungsjob zu erstellen
 */
export function createCompleteVideoJob(
  segments: VideoSegmentParams[],
  outputKey: string,
  voiceoverKey: string | undefined,
  userId: string
) {
  const inputs = segments.map(segment => segment.videoKey);
  if (voiceoverKey) {
    inputs.push(voiceoverKey);
  }
  
  return submitVideoProcessingJob(
    {
      jobType: 'complete',
      inputs,
      outputKey,
      params: {
        segments,
        voiceoverKey,
      },
    },
    userId
  );
} 