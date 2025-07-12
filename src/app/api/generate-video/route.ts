import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import UserModel from '@/models/User';
import VideoModel from '@/models/Video';
import Voiceover from '@/models/Voiceover';
import { generateUniqueFileName, getS3Url } from '@/lib/storage';
import { Types } from 'mongoose';
import { NextRequest } from 'next/server';
import { submitAwsBatchJobDirect, BatchJobTypes } from '@/utils/aws-batch-utils';
import mongoose from 'mongoose';

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
    addOutline: boolean;
    outlineWidth?: number;
    outlineColor?: string;
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
      
      // Generiere den korrekten, mandantengetrennten outputKey und outputUrl FRÜHZEITIG
      const { v4: uuidv4_project } = await import('uuid'); // Stelle sicher, dass uuid hier importiert ist
      const outputKey = `users/${session.user.id}/final/${uuidv4_project()}.mp4`;
      const outputUrl = getS3Url(outputKey);
      console.log('[Project Create] Generated user-specific output key:', outputKey);
      console.log('[Project Create] Generated corresponding S3 URL:', outputUrl);
      
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
        voiceoverId: voiceoverId || null,
        outputKey: outputKey, // Speichere korrekten Key
        outputUrl: outputUrl  // Speichere korrekte URL
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
      // Der korrekte outputKey und outputUrl wurden bereits beim Erstellen/Laden des Projekts generiert und gesetzt
      // Hole sie aus dem Projekt-Objekt, um Konsistenz sicherzustellen
      const finalOutputKey = project.outputKey;
      const finalOutputUrl = project.outputUrl;

      if (!finalOutputKey || !finalOutputUrl) {
        // Sollte nicht passieren, wenn die Logik oben korrekt ist
        console.error('OutputKey or OutputUrl is missing in the project document!', project);
        throw new Error('Project data is incomplete. Cannot determine output path.');
      }
      console.log('[Batch Submit] Using Output Key from project:', finalOutputKey);

      // Die Segmente für den AWS Batch Job vorbereiten (URLs werden aus Keys generiert)
      const videoSegments = segments.map(segment => ({
        videoId: segment.videoId,
        url: getS3Url(segment.videoKey),
            startTime: segment.startTime,
            duration: segment.duration,
            position: segment.position
      }));

      // Verwende den ersten Videoclip als Eingabe-URL für AWS Batch
      const firstVideoUrl = getS3Url(segments[0].videoKey);
      console.log('Using first video as input URL:', firstVideoUrl);
      
      // Erstelle template Daten die zu S3 hochgeladen werden
      const templateData = {
        segments: videoSegments,
        voiceoverId: voiceoverId || null,
        voiceoverText: voiceoverText || '',
        options: {
          addSubtitles: addSubtitles || false,
          subtitleOptions: subtitleOptions || null
        }
      };
      
      // Template-Daten in S3 speichern, um die Container Overrides Limite zu umgehen
      const { v4: uuidv4 } = await import('uuid');
      // Benutzer-ID für mandantensichere Speicherung
      const userId = session.user.id;
      const templateDataKey = `config/${uuidv4()}-template.json`;
      console.log(`Storing template data in S3 with key: ${templateDataKey}`);
      
      const templateDataBuffer = Buffer.from(JSON.stringify(templateData));
      console.log(`Template data size: ${templateDataBuffer.length} bytes`);
      
      // Importiere uploadToS3 Funktion
      const { uploadToS3 } = await import('@/lib/storage');
      
      // Lade template Daten nach S3 hoch
      await uploadToS3(
        templateDataBuffer,
        templateDataKey.split('/').pop() || 'template.json',
        'application/json',
        'config',
        userId
      );
      
      console.log('Template data stored in S3 successfully');
      
      // Speichere den Pfad zur Template-Datei im Projekt
      await ProjectModel.findByIdAndUpdate(project._id, {
        templateDataPath: templateDataKey
      });

      // Lade die Timestamps aus der Voiceover-DB und übergebe sie direkt
      let wordTimestampsJson = '';
      if (voiceoverId) {
        console.log(`Fetching timestamps for voiceoverId: ${voiceoverId}`);
        const voiceoverDoc = await Voiceover.findById(voiceoverId).select('wordTimestamps').lean();
        if (voiceoverDoc && 'wordTimestamps' in voiceoverDoc && Array.isArray(voiceoverDoc.wordTimestamps) && voiceoverDoc.wordTimestamps.length > 0) {
          wordTimestampsJson = JSON.stringify(voiceoverDoc.wordTimestamps);
          console.log(`Found ${voiceoverDoc.wordTimestamps.length} timestamps, size: ${wordTimestampsJson.length} bytes.`);
        } else {
          console.warn(`No timestamps found for voiceoverId: ${voiceoverId}`);
        }
      }

      // Bereite zusätzliche Parameter für den Batch-Job vor
      // WICHTIG: Hier keine großen Datenmengen direkt übergeben!
      const additionalParams: Record<string, string | number | boolean> = {
        USER_ID: userId,
        PROJECT_ID: project._id.toString(),
        TEMPLATE_DATA_PATH: templateDataKey, // Nur der S3-Pfad zu den Template-Daten
      };

      // Füge die Timestamps nur hinzu, wenn sie vorhanden sind
      if (wordTimestampsJson) {
        additionalParams.WORD_TIMESTAMPS = wordTimestampsJson;
      }
      
      console.log('Final (minimal) params for AWS Batch job:', additionalParams);
      
      const batchResponse = await submitAwsBatchJobDirect(
        BatchJobTypes.GENERATE_FINAL,
        firstVideoUrl, 
        finalOutputKey,
        additionalParams
      );
      
      console.log('AWS Batch job submitted successfully:', batchResponse);
      
      // Aktualisiere das Projekt mit der Job-ID (outputKey/Url sind schon korrekt)
      await ProjectModel.findByIdAndUpdate(project._id, {
        status: 'processing',
        jobId: batchResponse.jobId,
        batchJobId: batchResponse.jobId, // Sicherstellen, dass beide Felder gesetzt sind
        batchJobName: batchResponse.jobName
        // outputPath: finalOutputKey // Entferne/Ignoriere das veraltete outputPath Feld
      });

      // Erfolgsantwort senden
      return NextResponse.json({
        success: true,
        message: 'Video generation started',
        projectId: project._id.toString(),
        jobId: batchResponse.jobId,
        outputKey: finalOutputKey // Gib den korrekten Key zurück
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