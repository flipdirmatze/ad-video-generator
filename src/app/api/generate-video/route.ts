import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import VideoModel from '@/models/Video';
import { generateUniqueFileName } from '@/lib/storage';
import { Types } from 'mongoose';
import { NextRequest } from 'next/server';

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

    // Request-Daten holen und validieren
    let data: VideoGenerationRequest;
    try {
      data = await request.json();
      console.log('Received video generation request:', JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to parse request data:', error);
      return NextResponse.json({ 
        error: 'Invalid request data',
        details: error instanceof Error ? error.message : 'Failed to parse JSON'
      }, { status: 400 });
    }
    
    const { segments, voiceoverId, title = 'Mein Video' } = data;

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      console.error('Invalid segments data:', segments);
      return NextResponse.json({ 
        error: 'Video segments are required',
        details: {
          received: segments,
          type: typeof segments,
          isArray: Array.isArray(segments),
          length: Array.isArray(segments) ? segments.length : 0
        }
      }, { status: 400 });
    }

    // Validiere die Segment-Daten
    for (const segment of segments) {
      if (!segment.videoId || !segment.videoKey) {
        console.error('Invalid segment data:', segment);
        return NextResponse.json({
          error: 'Invalid segment data',
          details: {
            segment,
            missingFields: {
              videoId: !segment.videoId,
              videoKey: !segment.videoKey
            }
          }
        }, { status: 400 });
      }
    }

    // Datenbank verbinden
    try {
      await dbConnect();
      console.log('Connected to database successfully');
    } catch (error) {
      console.error('Database connection failed:', error);
      return NextResponse.json({
        error: 'Database connection failed',
        details: error instanceof Error ? error.message : 'Unknown database error'
      }, { status: 500 });
    }
    
    // Überprüfe, ob alle Videos existieren und dem Benutzer gehören
    const videoIds = [...new Set(segments.map(s => s.videoId))];
    console.log('Searching for videos with IDs:', videoIds);
    
    let videos;
    try {
      videos = await VideoModel.find({
        id: { $in: videoIds },
        userId: session.user.id
      }).lean();
      console.log('Found videos:', videos.map(v => ({ id: v.id, name: v.name })));
    } catch (error) {
      console.error('Failed to fetch videos:', error);
      return NextResponse.json({
        error: 'Failed to fetch videos',
        details: error instanceof Error ? error.message : 'Unknown database error'
      }, { status: 500 });
    }

    if (videos.length !== videoIds.length) {
      console.error('Some videos not found or not owned by user');
      const foundIds = videos.map(v => v.id);
      const missingIds = videoIds.filter(id => !foundIds.includes(id));
      return NextResponse.json({
        error: 'Some videos not found or not accessible',
        details: { 
          requestedIds: videoIds,
          foundIds,
          missingIds,
          userId: session.user.id
        }
      }, { status: 404 });
    }

    // Erstelle ein neues Projekt
    let project;
    try {
      console.log('Creating project with user ID:', {
        type: typeof session.user.id,
        value: session.user.id
      });
      
      project = await ProjectModel.create({
        userId: String(session.user.id),
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
      console.log('Created project:', {
        id: project._id,
        title: project.title,
        segments: project.segments.length
      });
    } catch (error) {
      console.error('Failed to create project:', error);
      return NextResponse.json({
        error: 'Failed to create project',
        details: error instanceof Error ? error.message : 'Unknown database error'
      }, { status: 500 });
    }

    // Starte den Video-Workflow
    try {
      // Erstelle ein Objekt mit den Workflow-Daten
      const workflowData = {
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
      };
      
      console.log('Preparing workflow data:', JSON.stringify(workflowData, null, 2));
      console.log('User ID type and value:', {
        type: typeof session.user.id,
        value: session.user.id
      });
      
      // Verwende die direkte Methode, um den Workflow zu starten
      const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://ad-video-generator.vercel.app').replace(/\/+$/, '');
      console.log(`Sending request to video-workflow at ${baseUrl}/api/video-workflow`);
      
      const requestOptions = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.API_SECRET_KEY || 'internal-api-call',
          'Authorization': `Bearer ${session.user.id}`
        },
        body: JSON.stringify(workflowData)
      };
      
      console.log('Request options:', {
        url: `${baseUrl}/api/video-workflow`,
        method: requestOptions.method,
        headers: requestOptions.headers,
        bodyLength: JSON.stringify(workflowData).length
      });
      
      const workflowResponse = await fetch(`${baseUrl}/api/video-workflow`, requestOptions);
      
      console.log('Workflow response status:', workflowResponse.status);

      if (!workflowResponse.ok) {
        let errorData;
        try {
          errorData = await workflowResponse.json();
          console.error('Workflow API error response:', errorData);
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          errorData = { error: 'Unknown error', status: workflowResponse.status };
        }
        
        // Detaillierte Fehlerinformationen loggen
        console.error('Workflow request failed with details:', {
          status: workflowResponse.status,
          statusText: workflowResponse.statusText,
          url: `${baseUrl}/api/video-workflow`,
          projectId: project._id.toString(),
          errorData
        });
        
        // Update project status to failed
        await ProjectModel.findByIdAndUpdate(project._id, {
          status: 'failed',
          error: errorData.message || errorData.error || `Failed to start video workflow (Status: ${workflowResponse.status})`
        });
        
        throw new Error(errorData.message || errorData.error || `Failed to start video workflow (Status: ${workflowResponse.status})`);
      }

      let workflowResponseData;
      try {
        workflowResponseData = await workflowResponse.json();
        console.log('Workflow started successfully:', workflowResponseData);
      } catch (parseError) {
        console.error('Failed to parse workflow response:', parseError);
        throw new Error('Failed to parse response from workflow API');
      }

      // Update project with workflow data
      await ProjectModel.findByIdAndUpdate(project._id, {
        status: 'processing',
        batchJobId: workflowResponseData.jobId,
        batchJobName: workflowResponseData.jobName
      });

      return NextResponse.json({
        success: true,
        message: 'Video generation started',
        projectId: project._id.toString(),
        jobId: workflowResponseData.jobId,
        jobName: workflowResponseData.jobName || workflowResponseData.status,
        estimatedTime: "Your video will be processed and will be ready in a few minutes"
      });
    } catch (error) {
      console.error('Error in workflow process:', error);
      return NextResponse.json({
        error: 'Failed to start video workflow',
        details: error instanceof Error ? error.message : 'Unknown workflow error'
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Unhandled error in video generation:', error);
    return NextResponse.json({ 
      error: 'Failed to generate video',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
} 