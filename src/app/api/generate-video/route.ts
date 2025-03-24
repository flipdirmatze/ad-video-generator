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
      
      // Erstelle template Daten die zu S3 hochgeladen werden
      const templateData = {
        segments: videoSegments,
        voiceoverId: voiceoverId || null,
        voiceoverText: voiceoverText || '',
        addSubtitles: addSubtitles || false,
        subtitleOptions: subtitleOptions || null
      };
      
      // Template-Daten in S3 speichern, um die Container Overrides Limite zu umgehen
      const { v4: uuidv4 } = await import('uuid');
      const templateDataKey = `config/${session.user.id}/${uuidv4()}-template.json`;
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
        'config'
      );
      
      console.log('Template data stored in S3 successfully');
      
      // Speichere den Pfad zur Template-Datei im Projekt
      await ProjectModel.findByIdAndUpdate(project._id, {
        templateDataPath: templateDataKey
      });

      // Konstruiere die additionalParams für den AWS Batch Job
      const additionalParams: Record<string, any> = {
        USER_ID: session.user.id,
        PROJECT_ID: project._id.toString(),
        TEMPLATE_DATA_PATH: templateDataKey, // Pfad zu den Template-Daten in S3
        TITLE: title,
        // Für Abwärtskompatibilität mit bestehenden AWS Batch Container-Skripten
        // setzen wir sowohl ein Verweis auf die S3-Template-Datei als auch die wichtigsten
        // Daten direkt in TEMPLATE_DATA, damit der Container initial arbeiten kann
        TEMPLATE_DATA: JSON.stringify({
          type: 's3Path',
          path: templateDataKey,
          // Include essential data to avoid dependency on S3 loading
          segments: videoSegments.slice(0, 5).map(s => ({
            url: s.url,
            startTime: s.startTime || 0,
            duration: s.duration || 10,
            position: s.position || 0
          })), // Include first 5 segments with minimal data
          segmentCount: videoSegments.length,
          voiceoverText: voiceoverText || '',
          addSubtitles: addSubtitles || false
        })
      };

      // Set subtitle options if enabled
      if (addSubtitles && subtitleOptions) {
        console.log('Adding subtitle options to batch parameters');
        additionalParams.ADD_SUBTITLES = 'true';
        additionalParams.SUBTITLE_TEXT = voiceoverText || '';
        additionalParams.SUBTITLE_FONT_NAME = subtitleOptions.fontName || 'Arial';
        additionalParams.SUBTITLE_FONT_SIZE = subtitleOptions.fontSize || 24;
        additionalParams.SUBTITLE_PRIMARY_COLOR = subtitleOptions.primaryColor || '#FFFFFF';
        additionalParams.SUBTITLE_BACKGROUND_COLOR = subtitleOptions.backgroundColor || '#80000000';
        additionalParams.SUBTITLE_POSITION = subtitleOptions.position || 'bottom';
      }

      // Voiceover-URL direkt bereitstellen, wenn verfügbar
      if (voiceoverId) {
        try {
          console.log(`Finding voiceover with ID: ${voiceoverId}`);
          // Hole die Voiceover-Datei aus der Datenbank
          const voiceover = await mongoose.model('Voiceover').findById(voiceoverId);
          
          if (voiceover) {
            console.log('Voiceover found:', {
              id: voiceover._id,
              name: voiceover.name,
              path: voiceover.path,
              url: voiceover.url
            });
            
            if (voiceover.path) {
              // Pass both the direct S3 URL and the file path for maximum compatibility
              additionalParams.VOICEOVER_URL = getS3Url(voiceover.path);
              additionalParams.VOICEOVER_KEY = voiceover.path;
              
              console.log('Adding voiceover to batch job:');
              console.log('- VOICEOVER_URL:', additionalParams.VOICEOVER_URL);
              console.log('- VOICEOVER_KEY:', additionalParams.VOICEOVER_KEY);
              
              // Übergebe Wort-Zeitstempel für Untertitel-Synchronisation, wenn verfügbar
              if (voiceover.wordTimestamps && voiceover.wordTimestamps.length > 0) {
                console.log(`Found ${voiceover.wordTimestamps.length} word timestamps for accurate subtitle synchronization`);
                
                // *** EXTREME DEBUG LOGGING ***
                console.log('VOICEOVER OBJECT STRUCTURE:');
                console.log(JSON.stringify(voiceover, null, 2).substring(0, 1000) + '...');
                
                // Detaillierte Debug-Ausgabe
                console.log(`Type of wordTimestamps: ${typeof voiceover.wordTimestamps}`);
                console.log(`Is array: ${Array.isArray(voiceover.wordTimestamps)}`);
                
                // Überprüfe die Timestamp-Struktur
                const firstThree = voiceover.wordTimestamps.slice(0, 3);
                console.log('First 3 timestamps structure check:');
                console.log(JSON.stringify(firstThree, null, 2));
                
                // Konvertiere zu JSON-String
                const timestampsJson = JSON.stringify(voiceover.wordTimestamps);
                console.log(`JSON string length: ${timestampsJson.length} characters`);
                
                // *** DEBUG: ORIGINAL TIMESTAMPS JSON SAMPLE ***
                console.log('TIMESTAMPS JSON SAMPLE (first 500 chars):');
                console.log(timestampsJson.substring(0, 500));
                
                // Prüfe auf Maximalgröße (AWS Batch Environment Variable Limit)
                const MAX_ENV_SIZE = 30000; // 30 KB ist ein konservatives Limit für Umgebungsvariablen
                
                if (timestampsJson.length > MAX_ENV_SIZE) {
                  console.warn(`WARNING: Timestamps JSON string is ${timestampsJson.length} bytes, which exceeds env var limit of ${MAX_ENV_SIZE} bytes.`);
                  console.log('Uploading timestamps to S3 instead of passing directly as env var.');
                  
                  // Hochladen der Timestamps als separate Datei nach S3
                  try {
                    const timestampS3Key = `timestamps/${voiceoverId}_timestamps.json`;
                    
                    // Hochladen zu S3
                    const buffer = Buffer.from(timestampsJson);
                    const s3Url = await uploadToS3(
                      buffer,
                      timestampS3Key,
                      'application/json'
                    );
                    
                    console.log(`Timestamps uploaded to S3: ${s3Url}`);
                    
                    // Nur den S3-Pfad als Umgebungsvariable übergeben
                    additionalParams.WORD_TIMESTAMPS_PATH = timestampS3Key;
                    console.log('Using S3 path for word timestamps:', timestampS3Key);
                    
                    // Für Debugging: Ausgabe der ersten paar Timestamps
                    console.log('Sample timestamps (first 3):');
                    voiceover.wordTimestamps.slice(0, 3).forEach((ts: any, i: number) => {
                      console.log(`  ${i+1}: "${ts.word}" - ${ts.startTime}s to ${ts.endTime}s`);
                    });
                  } catch (s3Error) {
                    console.error('Error uploading timestamps to S3:', s3Error);
                    console.log('Falling back to simplified subtitle timing');
                  }
                } else {
                  // Zeitstempel als JSON-String übergeben
                  additionalParams.WORD_TIMESTAMPS = timestampsJson;
                  
                  // Für Debugging: Ausgabe der ersten paar Timestamps
                  console.log('Sample timestamps (first 3):');
                  voiceover.wordTimestamps.slice(0, 3).forEach((ts: any, i: number) => {
                    console.log(`  ${i+1}: "${ts.word}" - ${ts.startTime}s to ${ts.endTime}s`);
                  });
                }
              } else {
                console.log('No word timestamps available for this voiceover, subtitles will use estimated timing');
              }
            } else {
              console.error('Voiceover document has no path field:', voiceover);
              // Trotzdem die ID übergeben als Fallback
              additionalParams.VOICEOVER_ID = voiceoverId;
              console.log('Added VOICEOVER_ID as fallback:', voiceoverId);
            }
          } else {
            console.error(`Voiceover with ID ${voiceoverId} not found in database`);
            // Trotzdem die ID übergeben als Fallback
            additionalParams.VOICEOVER_ID = voiceoverId;
            console.log('Added VOICEOVER_ID as fallback:', voiceoverId);
          }
        } catch (voiceoverError) {
          console.error('Error getting voiceover:', voiceoverError);
          // Trotzdem die ID übergeben als Fallback
          additionalParams.VOICEOVER_ID = voiceoverId;
          console.log('Added VOICEOVER_ID as fallback despite error:', voiceoverId);
        }
      }

      // WICHTIG: Hier immer die Voiceover-ID direkt übergeben, unabhängig davon, ob wir die URL haben
      if (voiceoverId && !additionalParams.VOICEOVER_ID) {
        additionalParams.VOICEOVER_ID = voiceoverId;
        console.log('Added VOICEOVER_ID directly:', voiceoverId);
      }

      console.log('Final batch parameters for voiceover:');
      console.log('- VOICEOVER_URL:', additionalParams.VOICEOVER_URL || 'not set');
      console.log('- VOICEOVER_KEY:', additionalParams.VOICEOVER_KEY || 'not set');
      console.log('- VOICEOVER_ID:', additionalParams.VOICEOVER_ID || 'not set');

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