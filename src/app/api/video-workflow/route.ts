import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import VideoModel from '@/models/Video';
import { getS3Url, generateUniqueFileName, uploadToS3 } from '@/lib/storage';
import { submitAwsBatchJobDirect, BatchJobTypes } from '@/utils/aws-batch-utils';
import mongoose from 'mongoose';

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
  voiceoverText?: string;
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
    subtitleOptions?: {
      fontName: string;
      fontSize: number;
      primaryColor: string;
      backgroundColor: string;
      borderStyle: number;
      position: string;
    };
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
    let userId;
    const session = await getServerSession(authOptions);
    
    if (session?.user?.id) {
      userId = session.user.id;
      console.log('User authenticated via session:', userId);
    } else {
      // Prüfe auf interne API-Aufrufe
      const authHeader = request.headers.get('Authorization');
      const apiKey = request.headers.get('x-api-key');
      
      if (apiKey === (process.env.API_SECRET_KEY || 'internal-api-call') && authHeader?.startsWith('Bearer ')) {
        userId = authHeader.substring(7); // Entferne 'Bearer ' vom Anfang
        console.log('User authenticated via API key:', userId);
      } else {
        console.error('Unauthorized: No valid session or API key');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    
    // Request-Daten validieren
    let data: WorkflowRequest;
    try {
      data = await request.json();
      console.log('Received workflow request:', JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to parse request data:', error);
      return NextResponse.json({
        error: 'Invalid request data',
        details: error instanceof Error ? error.message : 'Failed to parse JSON'
      }, { status: 400 });
    }
    
    // Stelle sicher, dass die userId im Request mit der authentifizierten userId übereinstimmt
    if (data.userId && data.userId !== userId) {
      console.error('User ID mismatch:', { requestUserId: data.userId, authenticatedUserId: userId });
      return NextResponse.json({ error: 'User ID mismatch' }, { status: 403 });
    }
    
    // Setze die userId im Request auf die authentifizierte userId
    data.userId = userId;
    
    // Grundlegende Validierung
    if (!data.title || !data.videos || data.videos.length === 0) {
      console.error('Missing required fields:', {
        hasTitle: !!data.title,
        hasVideos: !!data.videos,
        videosLength: data.videos?.length
      });
      return NextResponse.json(
        { 
          error: 'Title and at least one video are required',
          details: {
            missingFields: {
              title: !data.title,
              videos: !data.videos || data.videos.length === 0
            }
          }
        },
        { status: 400 }
      );
    }
    
    // Mit Datenbank verbinden
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
    
    // Prüfen, ob die angegebenen Videos existieren und dem Benutzer gehören
    const videoIds = data.videos.map(v => v.id);
    console.log('Checking videos with IDs:', videoIds);
    
    let videos;
    try {
      videos = await VideoModel.find({ 
        id: { $in: videoIds },
        userId
      });
      console.log('Found videos:', videos.map(v => ({ id: v.id, name: v.name })));
    } catch (error) {
      console.error('Error fetching videos:', error);
      return NextResponse.json({
        error: 'Failed to fetch videos',
        details: error instanceof Error ? error.message : 'Unknown database error'
      }, { status: 500 });
    }
    
    if (videos.length !== videoIds.length) {
      const foundIds = videos.map(v => v.id);
      const missingIds = videoIds.filter(id => !foundIds.includes(id));
      console.error('Some videos not found:', { missingIds, userId });
      
      return NextResponse.json(
        { 
          error: 'Some videos not found or not accessible',
          details: {
            requestedIds: videoIds,
            foundIds,
            missingIds,
            userId
          }
        },
        { status: 404 }
      );
    }
    
    // Wenn eine projectId übergeben wurde, aktualisiere das bestehende Projekt
    let project;
    if (data.projectId) {
      try {
        console.log(`Looking for project with ID: ${data.projectId}`);
        
        // Versuche zuerst mit der exakten ID zu finden
        project = await ProjectModel.findById(data.projectId);
        
        if (!project) {
          console.log(`Project not found with exact ID, checking if it's a string representation of ObjectId`);
          // Versuche es als String-Repräsentation einer ObjectId
          project = await ProjectModel.findOne({ _id: data.projectId });
        }
        
        if (!project) {
          console.error(`Project not found with ID: ${data.projectId}`);
          return NextResponse.json(
            { error: 'Project not found', projectId: data.projectId },
            { status: 404 }
          );
        }
        
        if (project.userId !== userId) {
          console.error(`Project belongs to user ${project.userId}, but request is from user ${userId}`);
          console.log('User ID types:', {
            projectUserIdType: typeof project.userId,
            projectUserId: project.userId,
            authUserIdType: typeof userId,
            authUserId: userId
          });
          
          // Versuche, die IDs als Strings zu vergleichen
          const projectUserIdStr = String(project.userId);
          const authUserIdStr = String(userId);
          
          if (projectUserIdStr === authUserIdStr) {
            console.log('User IDs match when compared as strings');
          } else {
            return NextResponse.json(
              { error: 'No permission to access this project', projectId: data.projectId },
              { status: 403 }
            );
          }
        }
        
        console.log(`Found project: ${project._id}, title: ${project.title}`);
      } catch (error) {
        console.error(`Error fetching project with ID ${data.projectId}:`, error);
        return NextResponse.json({
          error: 'Failed to fetch project',
          details: error instanceof Error ? error.message : 'Unknown database error',
          projectId: data.projectId
        }, { status: 500 });
      }
    }
    
    // Segmente aus den Videos extrahieren und sortieren
    const segments = data.videos.flatMap(video => 
      video.segments.map(segment => ({
        videoId: video.id,
        videoKey: video.key,
        startTime: segment.startTime,
        duration: segment.duration,
        position: segment.position
      }))
    ).sort((a, b) => a.position - b.position);
    
    console.log('Prepared segments:', segments);
    
    // Generiere einen eindeutigen, mandantengetrennten Ausgabeschlüssel für das finale Video
    const outputKey = `users/${userId}/final/${uuidv4()}.mp4`;
    console.log('Generated user-specific output key:', outputKey);
    
    // Generiere die dazugehörige S3-URL
    const outputUrl = getS3Url(outputKey);
    console.log('Generated corresponding S3 URL:', outputUrl);
    
    try {
      if (!project) {
        // Erstelle ein neues Projekt
        console.log('Creating new project with user ID:', {
          type: typeof userId,
          value: userId
        });
        
        project = new ProjectModel({
          userId,
          title: data.title,
          description: data.description || '',
          status: 'pending',
          segments,
          voiceoverId: data.voiceoverId,
          outputKey,
          outputUrl,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      } else {
        // Aktualisiere das bestehende Projekt
        project.segments = segments;
        project.status = 'pending';
        project.outputKey = outputKey;
        project.outputUrl = outputUrl;
        project.updatedAt = new Date();
        if (data.voiceoverId) project.voiceoverId = data.voiceoverId;
      }
      
      await project.save();
      console.log('Project saved successfully:', {
        id: project._id,
        title: project.title,
        segments: segments.length
      });
    } catch (error) {
      console.error('Error saving project:', error);
      return NextResponse.json({
        error: 'Failed to save project',
        details: error instanceof Error ? error.message : 'Unknown database error'
      }, { status: 500 });
    }
    
    // Bereite die Template-Daten vor
    const templateData: {
      segments: { url: string; startTime: number; duration: number; position: number; }[];
      options: Record<string, unknown>;
      voiceoverId?: string;
      voiceoverText?: string;
      subtitleOptions?: {
        fontName: string;
        fontSize: number;
        primaryColor: string;
        backgroundColor: string;
        borderStyle: number;
        position: string;
      };
    } = {
      segments: segments.map(segment => ({
        url: getS3Url(segment.videoKey),
        startTime: segment.startTime || 0,
        duration: segment.duration || 10,
        position: segment.position || 0
      })),
      options: {}
    };
    
    // Voiceover- und Untertitelinformationen hinzufügen
    if (data.voiceoverId) {
      templateData.voiceoverId = data.voiceoverId;
    }
    
    if (data.voiceoverText) {
      templateData.voiceoverText = data.voiceoverText;
    }
    
    // Untertitel-Optionen hinzufügen, falls vorhanden
    if (data.options?.addSubtitles && data.options?.subtitleOptions) {
      templateData.subtitleOptions = data.options.subtitleOptions;
    }
    
    // Speichere die Template-Daten in S3, um die Container Overrides Limits zu umgehen
    const templateDataKey = `config/${userId}/${uuidv4()}-template.json`;
    console.log(`Storing template data in S3 with key: ${templateDataKey}`);
    
    try {
      // Konvertiere das JSON-Objekt in einen Buffer
      const templateDataBuffer = Buffer.from(JSON.stringify(templateData));
      
      // Logge die Größe der Template-Daten für Debugging-Zwecke
      console.log(`Template data size: ${templateDataBuffer.length} bytes`);
      
      // Lade die Template-Daten nach S3 hoch
      await uploadToS3(
        templateDataBuffer,
        templateDataKey.split('/').pop() || 'template.json',
        'application/json',
        templateDataKey.startsWith('config/') ? 'config' : 'uploads',
        userId
      );
      
      console.log('Template data stored in S3 successfully');
      
      // Aktualisiere das Projekt mit dem Pfad zur Template-Datei
      project.templateDataPath = templateDataKey;
      await project.save();
    } catch (s3Error) {
      console.error('Error storing template data in S3:', s3Error);
      throw new Error(`Failed to store template data: ${s3Error instanceof Error ? s3Error.message : String(s3Error)}`);
    }
    
    // Bereite die Job-Parameter vor
    const jobParams: Record<string, string | number | boolean> = {
      PROJECT_ID: project._id.toString(),
      USER_ID: userId,
      SEGMENTS: JSON.stringify(segments),
      OUTPUT_KEY: outputKey
    };
    
    // Füge optionale Parameter hinzu
    if (data.voiceoverId) {
      try {
        console.log(`Finding voiceover with ID: ${data.voiceoverId}`);
        // Hole die Voiceover-Datei aus der Datenbank
        const VoiceoverModel = mongoose.model('Voiceover');
        const voiceover = await VoiceoverModel.findById(data.voiceoverId);
        
        if (voiceover) {
          console.log('Voiceover found:', {
            id: voiceover._id,
            name: voiceover.name,
            path: voiceover.path,
            url: voiceover.url
          });
          
          if (voiceover.path) {
            // Pass both the direct S3 URL and the file path for maximum compatibility
            jobParams.VOICEOVER_URL = getS3Url(voiceover.path);
            jobParams.VOICEOVER_KEY = voiceover.path;
            
            console.log('Adding voiceover to batch job:');
            console.log('- VOICEOVER_URL:', jobParams.VOICEOVER_URL);
            console.log('- VOICEOVER_KEY:', jobParams.VOICEOVER_KEY);
          } else {
            console.error('Voiceover document has no path field:', voiceover);
          }
        } else {
          console.error(`Voiceover with ID ${data.voiceoverId} not found in database`);
        }
      } catch (voiceoverError) {
        console.error('Error getting voiceover:', voiceoverError);
        // Fahre fort ohne Voiceover-URL, aber behalte die ID
        jobParams.VOICEOVER_ID = data.voiceoverId;
      }
    }

    if (data.voiceoverText) jobParams.SUBTITLE_TEXT = data.voiceoverText;

    if (data.options) {
      if (data.options.resolution) jobParams.RESOLUTION = data.options.resolution;
      if (data.options.aspectRatio) jobParams.ASPECT_RATIO = data.options.aspectRatio;
      if (data.options.addSubtitles) {
        jobParams.ADD_SUBTITLES = 'true';
        // Voiceover-Text für Untertitel weitergeben, falls vorhanden
        if (data.voiceoverText) {
          jobParams.SUBTITLE_TEXT = data.voiceoverText;
        }
        
        // Untertitel-Styling-Optionen weitergeben
        if (data.options.subtitleOptions) {
          jobParams.SUBTITLE_FONT_NAME = data.options.subtitleOptions.fontName;
          jobParams.SUBTITLE_FONT_SIZE = data.options.subtitleOptions.fontSize.toString();
          jobParams.SUBTITLE_POSITION = data.options.subtitleOptions.position;
        }
      }
      if (data.options.addWatermark) {
        jobParams.ADD_WATERMARK = 'true';
        if (data.options.watermarkText) jobParams.WATERMARK_TEXT = data.options.watermarkText;
      }
      if (data.options.outputFormat) jobParams.OUTPUT_FORMAT = data.options.outputFormat;
    }
    
    console.log('Submitting AWS Batch job with params:', jobParams);
    
    // Starte den AWS Batch-Job
    try {
      // Der outputKey wurde bereits oben generiert und in jobParams.OUTPUT_KEY gesetzt.
      // Die inputVideoUrl wird ebenfalls benötigt.
      const inputVideoUrl = getS3Url(segments[0].videoKey); // Annahme: segments[0] existiert immer
      console.log(`Converting S3 key to full URL: ${segments[0].videoKey} -> ${inputVideoUrl}`);
      
      // Bereite die zusätzlichen Parameter vor - NUR mit einem Verweis auf die S3-Datei
      // WICHTIG: Hier keinesfalls große Daten direkt übergeben
      const additionalParams = {
        USER_ID: userId,
        PROJECT_ID: project._id.toString(),
        TEMPLATE_DATA_PATH: templateDataKey, // Nur der Pfad, nicht die Daten selbst
        // DEBUG: 'true' // Kann bei Bedarf aktiviert werden
      };
      
      console.log('Submitting job with template data in S3:', {
        segmentsCount: templateData.segments.length,
        hasVoiceover: !!templateData.voiceoverId,
        templateDataPath: templateDataKey,
        templateDataSizeBytes: JSON.stringify(templateData).length
      });
      
      // Sende den Job an AWS Batch - verwende den bereits generierten outputKey
      const jobResult = await submitAwsBatchJobDirect(
        BatchJobTypes.GENERATE_FINAL,
        inputVideoUrl,
        outputKey, // Stelle sicher, dass dieser der mandantengetrennte Key ist
        additionalParams
      );
      
      if (!jobResult || !jobResult.jobId) {
        throw new Error('Failed to submit AWS Batch job: No job ID returned');
      }
      
      console.log(`AWS Batch job submitted successfully: ${jobResult.jobId}`);
      
      // Aktualisiere das Projekt mit der Job-ID
      project.batchJobId = jobResult.jobId;
      project.batchJobName = jobResult.jobName;
      project.status = 'processing';
      await project.save();
      
      return NextResponse.json({
        success: true,
        message: 'Video workflow started',
        projectId: project._id.toString(),
        jobId: jobResult.jobId,
        jobName: jobResult.jobName
      });
    } catch (error) {
      console.error('Error submitting AWS Batch job:', error);
      
      // Detaillierte Fehlerinformationen loggen
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      }
      
      // Aktualisiere das Projekt mit dem Fehlerstatus
      project.status = 'failed';
      project.error = error instanceof Error ? error.message : 'Unknown error submitting AWS Batch job';
      await project.save();
      
      return NextResponse.json(
        { 
          error: 'Failed to submit AWS Batch job',
          details: error instanceof Error ? error.message : 'Unknown error',
          projectId: project._id.toString()
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Unhandled error in video workflow:', error);
    return NextResponse.json(
      { 
        error: 'Failed to start video workflow',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
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