import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { 
  VideoSegment,
  combineVideosWithVoiceover,
  generateFinalVideo
} from '@/utils/aws-batch-utils';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { addVideoGenerationJob } from '@/lib/queue';
import db from '@/lib/db';

// Ensure the output directory exists
async function ensureOutputDir() {
  const outputDir = path.join(process.cwd(), 'public', 'outputs');
  if (!fs.existsSync(outputDir)) {
    await fs.mkdir(outputDir, { recursive: true });
  }
  return outputDir;
}

type VideoRequestSegment = {
  videoId: string;
  startTime: number;
  duration: number;
  position: number;
}

type VideoRequest = {
  voiceoverUrl: string;
  segments: VideoRequestSegment[];
  videos: Array<{
    id: string;
    url: string;
  }>;
}

// Error types for better client-side handling
type ErrorResponse = {
  error: string;
  code: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any;
  suggestions?: string[];
}

export async function POST(request: Request) {
  try {
    // Authenticate user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get request data
    const data = await request.json();
    const { segments, voiceoverUrl, voiceoverScript } = data;
    
    if (!segments || segments.length === 0) {
      return NextResponse.json({ error: 'No video segments provided' }, { status: 400 });
    }
    
    // Create record in database using Mongoose instead of Prisma
    const project = await db.project.create({
      data: {
        userId: session.user.id,
        status: 'PROCESSING',
        segments: segments,
        voiceoverScript,
        voiceoverUrl,
      },
    });
    
    // Add job to queue - using AWS Batch via queue abstraction
    const job = await addVideoGenerationJob({
      projectId: project.id,
      userId: session.user.id,
      segments,
      voiceoverUrl,
      voiceoverScript
    });
    
    return NextResponse.json({
      success: true,
      message: 'Video generation started on AWS Batch',
      projectId: project.id,
      jobId: job.id,
      estimatedTime: "Your video will be processed on AWS Batch and will be ready in a few minutes"
    });
  } catch (error) {
    console.error('Error starting video generation:', error);
    return NextResponse.json(
      { error: 'Failed to start video generation', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 