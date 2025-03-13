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
  title: string;                  // Projekttitel
  description?: string;          // Optionale Projektbeschreibung
  voiceoverScript?: string;      // Text für die Voiceover-Generierung (optional)
  voiceoverUrl?: string;         // URL zu einer bereits generierten Voiceover-Datei (optional)
  videos: {                      // Videos, die verwendet werden sollen
    id: string;                  // Video-ID aus der Datenbank
    segments?: VideoSegment[];   // Segmente, die aus diesem Video verwendet werden sollen (optional)
  }[];
  // Weitere Optionen für die Videobearbeitung
  options?: {
    resolution?: string;         // z.B. "1080p", "720p"
    aspectRatio?: string;        // z.B. "16:9", "1:1", "9:16"
    addSubtitles?: boolean;      // Untertitel hinzufügen?
    addWatermark?: boolean;      // Wasserzeichen hinzufügen?
    watermarkText?: string;      // Text für das Wasserzeichen
    outputFormat?: string;       // z.B. "mp4", "mov"
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
    
    // Projekt in der Datenbank erstellen
    const projectId = uuidv4();
    const outputFileName = generateUniqueFileName(`${data.title.toLowerCase().replace(/\s+/g, '-')}.mp4`);
    const outputKey = `final/${userId}/${outputFileName}`;
    
    // Segmente vorbereiten
    const segments = [];
    let position = 0;
    
    for (const videoEntry of data.videos) {
      const video = videos.find(v => v._id.toString() === videoEntry.id);
      
      if (videoEntry.segments && videoEntry.segments.length > 0) {
        // Benutze die angegebenen Segmente
        for (const segment of videoEntry.segments) {
          segments.push({
            videoId: video._id.toString(),
            videoKey: video.path,
            startTime: segment.startTime,
            duration: segment.duration,
            position: segment.position || position++
          });
        }
      } else {
        // Wenn keine Segmente angegeben sind, verwende das gesamte Video
        segments.push({
          videoId: video._id.toString(),
          videoKey: video.path,
          startTime: 0,
          duration: video.duration || 0, // Fallback, falls keine Dauer bekannt ist
          position: position++
        });
      }
    }
    
    // Sortiere die Segmente nach Position
    segments.sort((a, b) => a.position - b.position);
    
    // Voiceover-Verarbeitung
    let voiceoverId = null;
    let voiceoverUrl = data.voiceoverUrl;
    
    // Wenn ein Voiceover-Skript angegeben wurde, generiere ein Voiceover
    if (data.voiceoverScript && !voiceoverUrl) {
      try {
        const voiceoverResponse = await fetch('/api/generate-voiceover', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ script: data.voiceoverScript }),
        });
        
        if (!voiceoverResponse.ok) {
          throw new Error(`Failed to generate voiceover: ${voiceoverResponse.statusText}`);
        }
        
        const voiceoverData = await voiceoverResponse.json();
        voiceoverId = voiceoverData.voiceoverId;
        voiceoverUrl = voiceoverData.url;
      } catch (error) {
        console.error('Error generating voiceover:', error);
        // Wir setzen den Workflow trotzdem fort, aber loggen den Fehler
      }
    }
    
    // Erstelle das Projekt in der Datenbank
    const project = new ProjectModel({
      userId,
      title: data.title,
      description: data.description || '',
      status: 'pending',
      segments,
      voiceoverId,
      outputKey,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await project.save();
    
    // Starte den AWS Batch-Job
    const jobParams: Record<string, string | number | boolean> = {
      PROJECT_ID: project._id.toString(),
      USER_ID: userId,
      SEGMENTS: JSON.stringify(segments),
    };
    
    // Füge optionale Parameter hinzu
    if (voiceoverUrl) {
      jobParams.VOICEOVER_URL = voiceoverUrl;
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
    
    // Nehme das erste Video als Referenz
    const firstVideoPath = segments[0]?.videoKey;
    let inputVideoUrl = '';
    
    if (firstVideoPath) {
      inputVideoUrl = getS3Url(firstVideoPath);
    }
    
    // Starte den Batch-Job
    const { jobId, jobName } = await submitAwsBatchJob(
      'generate-final',
      inputVideoUrl,
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
      message: 'Videogenerierungs-Workflow gestartet',
      projectId: project._id,
      jobId,
      status: 'processing',
      estimatedTime: 'Dein Video wird in wenigen Minuten fertig sein'
    });
  } catch (error) {
    console.error('Error starting video workflow:', error);
    return NextResponse.json(
      { error: 'Fehler beim Starten des Video-Workflows', details: error instanceof Error ? error.message : String(error) },
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
      return NextResponse.json({ error: 'Projekt nicht gefunden' }, { status: 404 });
    }
    
    // Status des Batch-Jobs prüfen, falls im Verarbeitungsstatus
    let progress = 0;
    
    if (project.status === 'processing' && project.batchJobId) {
      try {
        const statusResponse = await fetch(`/api/project-status/${project._id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          if (statusData.progress) {
            progress = statusData.progress;
          }
          
          // Aktualisiere den Projektstatus, falls er sich geändert hat
          if (statusData.status !== project.status) {
            project.status = statusData.status;
            await project.save();
          }
        }
      } catch (error) {
        console.error('Error fetching project status:', error);
        // Ignoriere Fehler beim Abrufen des Status, behalte den aktuellen Status bei
      }
    }
    
    return NextResponse.json({
      success: true,
      project: {
        id: project._id,
        title: project.title,
        description: project.description,
        status: project.status,
        progress, // 0-100
        outputUrl: project.outputUrl,
        batchJobId: project.batchJobId,
        batchJobName: project.batchJobName,
        error: project.error,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching workflow status:', error);
    return NextResponse.json(
      { error: 'Fehler beim Abrufen des Workflow-Status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 