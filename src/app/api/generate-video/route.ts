import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import VideoModel from '@/models/Video';
import { generateUniqueFileName, getS3Url } from '@/lib/storage';
import { Types } from 'mongoose';
import { NextRequest } from 'next/server';
import { submitAwsBatchJob, BatchJobTypes } from '@/utils/aws-batch-utils';

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
  voiceoverText?: string; // Text für Untertitel
  title?: string;
  projectId?: string;
  addSubtitles?: boolean; // Untertitel aktiviert
  subtitleOptions?: {
    fontName: string;
    fontSize: number;
    primaryColor: string;
    backgroundColor: string;
    borderStyle: number;
    position: string;
  }; // Untertitel-Optionen
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
    
    const { 
      segments, 
      voiceoverId, 
      voiceoverText, 
      title = 'Mein Video', 
      projectId, 
      addSubtitles, 
      subtitleOptions 
    } = data;

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

    // Starte direkt den AWS Batch Job statt über video-workflow
    try {
      // Ausgabedateinamen generieren
      const outputFileName = generateUniqueFileName(`${title.toLowerCase().replace(/\s+/g, '-')}.mp4`);
      const outputKey = `final/${session.user.id}/${outputFileName}`;
      console.log('Generated output key:', outputKey);

      // Die Segmente für den AWS Batch Job vorbereiten
      const videoSegments = segments.map(segment => ({
        videoId: segment.videoId,
        url: getS3Url(segment.videoKey),
        startTime: segment.startTime,
        duration: segment.duration,
        position: segment.position
      }));

      // Verwende den ersten Videoclip als Eingabevideo für AWS Batch
      // Der AWS Batch Job wird die eigentliche Verarbeitung basierend auf den übergebenen Segmenten durchführen
      const firstVideoUrl = getS3Url(segments[0].videoKey);
      console.log('Using first video as input URL:', firstVideoUrl);

      // Job an AWS Batch senden
      const additionalParams = {
        USER_ID: session.user.id,
        PROJECT_ID: project._id.toString(),
        SEGMENTS: JSON.stringify(videoSegments),
        TEMPLATE_DATA: JSON.stringify({ segments: videoSegments }),
        TITLE: title,
        ADD_SUBTITLES: addSubtitles ? 'true' : 'false',
        SUBTITLE_OPTIONS: subtitleOptions ? JSON.stringify(subtitleOptions) : '',
        VOICEOVER_TEXT: voiceoverText || '',
        VOICEOVER_ID: voiceoverId || ''
      };

      console.log('Submitting AWS Batch job with params:', additionalParams);
      
      const batchResponse = await submitAwsBatchJob(
        BatchJobTypes.GENERATE_FINAL,
        firstVideoUrl, // Verwende das erste Video als Eingabe-URL
        outputKey,
        additionalParams
      );
      
      console.log('AWS Batch job submitted successfully:', batchResponse);
      
      // Aktualisiere das Projekt mit der Job-ID
      await ProjectModel.findByIdAndUpdate(project._id, {
        status: 'processing',
        jobId: batchResponse.jobId,
        outputPath: outputKey
      });
      
      // Erfolgsantwort senden
      return NextResponse.json({
        success: true,
        message: 'Video generation started',
        projectId: project._id.toString(),
        jobId: batchResponse.jobId,
        outputPath: outputKey
      });
      
    } catch (error) {
      console.error('Error in AWS Batch process:', error);
      
      // Update project status to failed
      await ProjectModel.findByIdAndUpdate(project._id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error in AWS Batch process'
      });
      
      throw error;
    }
  } catch (error) {
    console.error('Error in video generation process:', error);
    return NextResponse.json({
      error: 'Video generation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error && error.stack ? error.stack : 'No stack trace available'
    }, { status: 500 });
  }
} 