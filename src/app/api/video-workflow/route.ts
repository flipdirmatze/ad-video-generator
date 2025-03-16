import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import VideoModel from '@/models/Video';
import { getS3Url, generateUniqueFileName } from '@/lib/storage';
import { submitAwsBatchJob } from '@/utils/aws-batch-utils';

type VideoSegment = {
  videoId: string;
  startTime: number;
  duration: number;
  position: number;
};

type WorkflowRequest = {
  projectId?: string;
  workflowType: string;
  userId: string;
  title: string;
  description?: string;
  voiceoverId?: string;
  videos: {
    id: string;
    key: string;
    segments: VideoSegment[];
  }[];
  options?: {
    resolution?: string;
    aspectRatio?: string;
    addSubtitles?: boolean;
    addWatermark?: boolean;
    watermarkText?: string;
    outputFormat?: string;
  };
};

/**
 * POST /api/video-workflow
 * Startet einen neuen Workflow zur Erstellung eines Werbevideos
 */
export async function POST(request: NextRequest) {
  console.log('Starting new video workflow');
  
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const data: WorkflowRequest = await request.json();
    
    // Grundlegende Validierung
    if (!data.title || !data.videos || data.videos.length === 0) {
      return NextResponse.json(
        { error: 'Titel und mindestens ein Video sind erforderlich' },
        { status: 400 }
      );
    }
    
    // Mit Datenbank verbinden
    await dbConnect();
    
    // Prüfen, ob die angegebenen Videos existieren und dem Benutzer gehören
    const videoIds = data.videos.map(v => v.id);
    const videos = await VideoModel.find({ 
      _id: { $in: videoIds },
      userId
    });
    
    if (videos.length !== videoIds.length) {
      const foundIds = videos.map(v => v._id.toString());
      const missingIds = videoIds.filter(id => !foundIds.includes(id));
      
      return NextResponse.json(
        { error: 'Einige Videos wurden nicht gefunden oder gehören nicht dir', missingIds },
        { status: 404 }
      );
    }
    
    // Wenn eine projectId übergeben wurde, aktualisiere das bestehende Projekt
    let project;
    if (data.projectId) {
      project = await ProjectModel.findById(data.projectId);
      if (!project || project.userId !== userId) {
        return NextResponse.json(
          { error: 'Projekt nicht gefunden oder keine Berechtigung' },
          { status: 404 }
        );
      }
    }
    
    // Ausgabedateinamen generieren
    const outputFileName = generateUniqueFileName(`${data.title.toLowerCase().replace(/\s+/g, '-')}.mp4`);
    const outputKey = `final/${userId}/${outputFileName}`;
    
    // Segmente aus den Videos extrahieren
    const segments = data.videos.flatMap(video => 
      video.segments.map(segment => ({
        videoId: video.id,
        videoKey: video.key,
        startTime: segment.startTime,
        duration: segment.duration,
        position: segment.position
      }))
    );
    
    // Sortiere die Segmente nach Position
    segments.sort((a, b) => a.position - b.position);
    
    if (!project) {
      // Erstelle ein neues Projekt
      project = new ProjectModel({
        userId,
        title: data.title,
        description: data.description || '',
        status: 'pending',
        segments,
        voiceoverId: data.voiceoverId,
        outputKey,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else {
      // Aktualisiere das bestehende Projekt
      project.segments = segments;
      project.status = 'pending';
      project.outputKey = outputKey;
      project.updatedAt = new Date();
      if (data.voiceoverId) project.voiceoverId = data.voiceoverId;
    }
    
    await project.save();
    
    // Bereite die Job-Parameter vor
    const jobParams: Record<string, string | number | boolean> = {
      PROJECT_ID: project._id.toString(),
      USER_ID: userId,
      SEGMENTS: JSON.stringify(segments),
      OUTPUT_KEY: outputKey
    };
    
    // Füge optionale Parameter hinzu
    if (data.voiceoverId) {
      jobParams.VOICEOVER_ID = data.voiceoverId;
    }
    
    if (data.options) {
      if (data.options.resolution) jobParams.RESOLUTION = data.options.resolution;
      if (data.options.aspectRatio) jobParams.ASPECT_RATIO = data.options.aspectRatio;
      if (data.options.addSubtitles) jobParams.ADD_SUBTITLES = 'true';
      if (data.options.addWatermark) {
        jobParams.ADD_WATERMARK = 'true';
        if (data.options.watermarkText) jobParams.WATERMARK_TEXT = data.options.watermarkText;
      }
      if (data.options.outputFormat) jobParams.OUTPUT_FORMAT = data.options.outputFormat;
    }
    
    // Starte den Batch-Job
    const { jobId, jobName } = await submitAwsBatchJob(
      'generate-final',
      segments[0].videoKey, // Erstes Video als Input
      outputKey,
      jobParams
    );
    
    // Aktualisiere das Projekt mit den Job-Informationen
    project.batchJobId = jobId;
    project.batchJobName = jobName;
    project.status = 'processing';
    await project.save();
    
    return NextResponse.json({
      success: true,
      message: 'Video generation started',
      projectId: project._id.toString(),
      jobId,
      jobName,
      status: 'processing',
      estimatedTime: 'Your video will be ready in a few minutes'
    });
  } catch (error) {
    console.error('Error starting video workflow:', error);
    return NextResponse.json(
      { error: 'Failed to start video workflow', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/video-workflow?projectId=xxx
 * Ruft den aktuellen Status eines Video-Workflows ab
 */
export async function GET(request: NextRequest) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    
    if (!projectId) {
      // Wenn keine Projekt-ID angegeben ist, gebe alle Projekte des Benutzers zurück
      await dbConnect();
      const projects = await ProjectModel.find({ userId })
        .sort({ createdAt: -1 })
        .limit(20);
      
      return NextResponse.json({
        success: true,
        projects: projects.map(p => ({
          id: p._id,
          title: p.title,
          status: p.status,
          outputUrl: p.outputUrl,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        }))
      });
    }
    
    // Mit Projekt-ID: Details zu einem bestimmten Projekt abrufen
    await dbConnect();
    const project = await ProjectModel.findOne({ _id: projectId, userId });
    
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      project: {
        id: project._id,
        title: project.title,
        status: project.status,
        progress: project.progress || 0,
        outputUrl: project.outputUrl,
        error: project.error,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching workflow status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workflow status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 