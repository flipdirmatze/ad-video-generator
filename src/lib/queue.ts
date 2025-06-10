/**
 * Queue-System für die Verarbeitung von Video-Jobs
 * Diese Datei wird möglicherweise später für komplexere Job-Verwaltung verwendet
 */

import { submitAwsBatchJobDirect } from '@/utils/aws-batch-utils';

export interface VideoJobData {
  userId: string;
  projectId: string;
  outputKey: string;
  segments: Array<{
    videoId: string;
    url: string;
    startTime: number;
    duration: number;
    position: number;
  }>;
}

export const processVideoJob = async (jobData: VideoJobData) => {
  console.log('Processing video job:', jobData);
  
  const jobResult = await submitAwsBatchJobDirect(
    'generate-final',
    jobData.segments[0].url, // Erste Video-URL als Input
    jobData.outputKey,
    {
      SEGMENTS: JSON.stringify(jobData.segments),
      USER_ID: jobData.userId,
      PROJECT_ID: jobData.projectId
    }
  );
  
  console.log('Video job submitted to AWS Batch:', jobResult);
  return jobResult;
}; 