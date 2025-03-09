/**
 * AWS Batch Utilities - Ersatz für die lokale ffmpeg-Verarbeitung
 * Diese Datei stellt Funktionen für die Videobearbeitung über AWS Batch bereit,
 * anstatt lokale ffmpeg-Prozesse zu verwenden.
 */

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
 * Ruft die AWS Batch API auf, um einen Videoverarbeitungsjob einzureichen
 */
export const submitAwsBatchJob = async (
  jobType: string,
  inputVideoUrl: string,
  outputKey?: string,
  additionalParams?: Record<string, any>
): Promise<{ jobId: string; jobName: string }> => {
  try {
    // Erstelle die Anfrage an unsere API-Route
    const response = await fetch('/api/aws-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobType,
        inputVideoUrl,
        outputKey,
        additionalParams,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`AWS Batch API-Fehler: ${errorData.error || response.statusText}`);
    }

    const data = await response.json();
    return {
      jobId: data.jobId,
      jobName: data.jobName,
    };
  } catch (error) {
    console.error('Fehler beim Senden des AWS Batch-Jobs:', error);
    throw error;
  }
};

/**
 * Kombiniert Videos mit Voiceover durch Delegieren an AWS Batch
 */
export const combineVideosWithVoiceover = async (
  voiceoverUrl: string,
  videoSegments: VideoSegment[],
  outputFileName: string,
  progressCallback?: (progress: number) => void
): Promise<string> => {
  try {
    // Formatiere die Videosegmente für den AWS Batch-Job
    const formattedSegments = videoSegments.map(segment => ({
      url: segment.url,
      startTime: segment.startTime,
      duration: segment.duration,
      position: segment.position,
    }));

    // Sende den Job an AWS Batch
    const jobResult = await submitAwsBatchJob(
      'add-voiceover',
      videoSegments[0].url, // Erster Videoclip als Referenz
      outputFileName,
      {
        VOICEOVER_URL: voiceoverUrl,
        VIDEO_SEGMENTS: JSON.stringify(formattedSegments),
      }
    );

    // Einrichten eines Intervalls, um den Fortschritt zu simulieren
    if (progressCallback) {
      let progress = 0;
      const interval = setInterval(() => {
        progress += 5;
        if (progress <= 95) {
          progressCallback(progress);
        } else {
          clearInterval(interval);
        }
      }, 1000);

      // In der realen Implementierung würde hier der tatsächliche Job-Status abgefragt werden
    }

    // Gib die URL zurück, wo das fertige Video später verfügbar sein wird
    // In einer realen Implementierung würde dies den tatsächlichen S3-URL zurückgeben
    return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/processed/${outputFileName}`;
  } catch (error) {
    console.error('Fehler beim Ausführen des Video-Voiceover-Jobs:', error);
    throw error;
  }
};

/**
 * Verbindet Videos ohne Neucodierung durch Delegieren an AWS Batch
 */
export const concatVideosWithoutReencoding = async (
  inputUrls: string[],
  outputFileName: string
): Promise<string> => {
  try {
    // Sende den Job an AWS Batch
    const jobResult = await submitAwsBatchJob(
      'concat',
      inputUrls[0], // Erster Videoclip als Referenz
      outputFileName,
      {
        VIDEO_URLS: JSON.stringify(inputUrls),
      }
    );

    // Gib die URL zurück, wo das fertige Video später verfügbar sein wird
    return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/processed/${outputFileName}`;
  } catch (error) {
    console.error('Fehler beim Ausführen des Video-Concat-Jobs:', error);
    throw error;
  }
};

/**
 * Erstellt das endgültige Video mit allen Anpassungen durch Delegieren an AWS Batch
 */
export const generateFinalVideo = async (
  templateData: any,
  outputFileName: string
): Promise<string> => {
  try {
    // Sende den Job an AWS Batch
    const jobResult = await submitAwsBatchJob(
      'generate-final',
      templateData.baseVideoUrl || '', // Basis-Video-URL als Referenz
      outputFileName,
      {
        TEMPLATE_DATA: JSON.stringify(templateData),
      }
    );

    // Gib die URL zurück, wo das fertige Video später verfügbar sein wird
    return `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/final/${outputFileName}`;
  } catch (error) {
    console.error('Fehler beim Erstellen des endgültigen Videos:', error);
    throw error;
  }
};
