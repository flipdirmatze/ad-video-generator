import { Queue, QueueScheduler, Worker } from 'bullmq';
import { processVideo } from './videoProcessor';
import Redis from 'ioredis';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Create a queue
export const videoQueue = new Queue('video-processing', { connection });
new QueueScheduler('video-processing', { connection });

// Create a worker
const worker = new Worker('video-processing', 
  async job => {
    try {
      console.log(`Processing job ${job.id}: ${job.name}`);
      
      const result = await processVideo(job.data);
      return result;
    } catch (error) {
      console.error(`Error processing job ${job.id}:`, error);
      throw error;
    }
  },
  { connection }
);

worker.on('completed', job => {
  console.log(`Job ${job.id} completed`);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error);
});

export async function addVideoGenerationJob(data: any) {
  return videoQueue.add('generate-video', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: false,
    removeOnFail: false,
  });
} 