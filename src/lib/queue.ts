/**
 * AWS Batch-basierte Warteschlange für Videobearbeitung
 * Diese Datei ersetzt die frühere BullMQ-Implementierung
 */

import { submitAwsBatchJob } from '@/utils/aws-batch-utils';

/**
 * Fügt einen Videobearbeitungsjob zur AWS Batch-Warteschlange hinzu
 */
export async function addVideoGenerationJob(data: any) {
  try {
    // Extrahiere relevante Daten für den AWS Batch-Job
    const { projectId, userId, segments, voiceoverUrl } = data;
    
    // Erstelle einen eindeutigen Output-Dateinamen
    const outputFileName = `${projectId || 'project'}-${Date.now()}.mp4`;
    
    // Sende den Job an AWS Batch
    const jobResult = await submitAwsBatchJob(
      'generate-final',
      // Wir verwenden die URL des ersten Segments als Eingabe-Referenz,
      // aber AWS Batch verarbeitet alle Segmente
      segments[0]?.videoUrl || '',
      outputFileName,
      {
        PROJECT_ID: projectId,
        USER_ID: userId,
        SEGMENTS: JSON.stringify(segments),
        VOICEOVER_URL: voiceoverUrl,
      }
    );
    
    // Gib ein ähnliches Objekt wie BullMQ zurück, um Kompatibilität zu wahren
    return {
      id: jobResult.jobId,
      name: jobResult.jobName
    };
  } catch (error) {
    console.error('Error adding job to AWS Batch:', error);
    throw error;
  }
} 