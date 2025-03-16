import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import VideoModel from '@/models/Video';
import { generateUniqueFileName } from '@/lib/storage';
import { Types } from 'mongoose';

// Typ für eingehende Video-Segment-Daten
type VideoSegmentRequest = {
  videoId: string;
  videoKey: string;
  startTime: number;
  duration: number;
  position: number;
};

// Typ für die Anfrage zur Videogenerierung
type VideoGenerationRequest = {
  segments: VideoSegmentRequest[];
  voiceoverId?: string;
  title?: string;
};

// Interface für das Video-Dokument mit _id
interface VideoDocument {
  _id: Types.ObjectId;
  id: string;
  userId: string;
  name: string;
  path: string;
  size: number;
  type: string;
}

export async function POST(request: Request) {
  try {
    console.log('Starting video generation process');
    
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.error('Unauthorized: No session or user ID');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Request-Daten holen
    const data: VideoGenerationRequest = await request.json();
    console.log('Received video generation request:', data);
    
    const { segments, voiceoverId, title = 'Mein Video' } = data;

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      console.error('Invalid segments data:', segments);
      return NextResponse.json({ error: 'Video segments are required' }, { status: 400 });
    }

    // Datenbank verbinden
    await dbConnect();
    
    // Überprüfe, ob alle Videos existieren und dem Benutzer gehören
    const videoIds = [...new Set(segments.map(s => s.videoId))];
    const videos = await VideoModel.find({
      _id: { $in: videoIds },
      userId: session.user.id
    }, '_id').lean();

    if (videos.length !== videoIds.length) {
      console.error('Some videos not found or not owned by user');
      const foundIds = videos.map(v => String(v._id));
      const missingIds = videoIds.filter(id => !foundIds.includes(id));
      return NextResponse.json({
        error: 'Some videos not found or not accessible',
        details: { missingIds }
      }, { status: 404 });
    }

    // Erstelle ein neues Projekt
    const project = await ProjectModel.create({
      userId: session.user.id,
      title,
      status: 'pending',
      segments: segments.map(segment => ({
        videoId: segment.videoId,
        videoKey: segment.videoKey,
        startTime: segment.startTime,
        duration: segment.duration,
        position: segment.position
      })),
      voiceoverId: voiceoverId || null
    });

    console.log('Created project:', project);

    // Starte den Video-Workflow
    const workflowResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/video-workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        projectId: project._id.toString(),
        workflowType: 'video_generation',
        userId: session.user.id,
        title: title,
        videos: segments.map(segment => ({
          id: segment.videoId,
          key: segment.videoKey,
          segments: [{
            startTime: segment.startTime,
            duration: segment.duration,
            position: segment.position
          }]
        })),
        voiceoverId: voiceoverId
      })
    });

    if (!workflowResponse.ok) {
      const errorData = await workflowResponse.json();
      console.error('Workflow API error:', errorData);
      
      // Update project status to failed
      await ProjectModel.findByIdAndUpdate(project._id, {
        status: 'failed',
        error: errorData.message || errorData.error || 'Failed to start video workflow'
      });
      
      throw new Error(errorData.message || errorData.error || 'Failed to start video workflow');
    }

    const workflowData = await workflowResponse.json();
    console.log('Workflow started successfully:', workflowData);

    // Update project with workflow data
    await ProjectModel.findByIdAndUpdate(project._id, {
      status: 'processing',
      batchJobId: workflowData.jobId,
      batchJobName: workflowData.jobName
    });

    return NextResponse.json({
      success: true,
      message: 'Video generation started',
      projectId: project._id.toString(),
      jobId: workflowData.jobId,
      jobName: workflowData.jobName || workflowData.status,
      estimatedTime: "Your video will be processed and will be ready in a few minutes"
    });
  } catch (error) {
    console.error('Error generating video:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate video', 
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
} 