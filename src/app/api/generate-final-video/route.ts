import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { 
  VideoSegment,
  submitAwsBatchJobDirect,
  BatchJobTypes
} from '@/utils/aws-batch-utils';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import { getS3Url } from '@/lib/storage';

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
    
    // Connect to database
    await dbConnect();
    
    // Get request data
    const data = await request.json();
    const { segments, voiceoverUrl, voiceoverScript } = data;
    
    if (!segments || segments.length === 0) {
      return NextResponse.json({ error: 'No video segments provided' }, { status: 400 });
    }
    
    // Generate unique output key for the user
    const outputKey = `users/${session.user.id}/final/${uuidv4()}.mp4`;
    const outputUrl = getS3Url(outputKey);
    
    // Create record in database
    const project = await ProjectModel.create({
      userId: session.user.id,
      title: 'Generated Video',
      status: 'processing',
      segments: segments.map((segment: VideoRequestSegment) => ({
        videoId: segment.videoId,
        startTime: segment.startTime,
        duration: segment.duration,
        position: segment.position
      })),
      outputKey,
      outputUrl,
      voiceoverId: voiceoverScript // Store script as voiceoverId for now
    });
    
    // Prepare video segments for AWS Batch
    const videoSegments: VideoSegment[] = segments.map((segment: VideoRequestSegment) => ({
      videoId: segment.videoId,
      url: '', // Will be resolved in AWS Batch
      startTime: segment.startTime,
      duration: segment.duration,
      position: segment.position
    }));
    
    // Submit job directly to AWS Batch
    const jobResult = await submitAwsBatchJobDirect(
      BatchJobTypes.GENERATE_FINAL,
      voiceoverUrl || videoSegments[0]?.url || '',
      outputKey,
      {
        PROJECT_ID: project._id.toString(),
        USER_ID: session.user.id,
        SEGMENTS: JSON.stringify(videoSegments),
        VOICEOVER_URL: voiceoverUrl,
        VOICEOVER_SCRIPT: voiceoverScript
      }
    );
    
    // Update project with job ID
    await ProjectModel.findByIdAndUpdate(project._id, {
      jobId: jobResult.jobId,
      batchJobId: jobResult.jobId,
      batchJobName: jobResult.jobName
    });
    
    return NextResponse.json({
      success: true,
      message: 'Video generation started on AWS Batch',
      projectId: project._id.toString(),
      jobId: jobResult.jobId,
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