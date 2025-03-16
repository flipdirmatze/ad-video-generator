import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';
import JobModel from '@/models/Job';
import ProjectModel from '@/models/Project';
import { submitAwsBatchJob } from '@/utils/aws-batch-utils';
import { getSignedVideoUrl } from '@/lib/storage';

// Typen für die Anfrage
export type VideoSegment = {
  videoId: string;
  url: string;
  startTime: number;
  duration: number;
  position: number;
};

export type WorkflowRequest = {
  segments: VideoSegment[];
  voiceoverUrl?: string;
  outputFileName: string;
};

/**
 * Verarbeitet POST-Anfragen zum Starten eines Video-Workflows
 */
export async function POST(request: NextRequest) {
  try {
    // Überprüfe die Authentifizierung
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 });
    }

    // Extrahiere die Anfragedaten
    const data: WorkflowRequest = await request.json();
    const { segments, voiceoverUrl, outputFileName } = data;

    console.log('Starte Video-Workflow mit:', {
      segmentsCount: segments.length,
      hasVoiceover: !!voiceoverUrl,
      outputFileName
    });

    // Validiere die Anfrage
    if (!segments || segments.length === 0) {
      return NextResponse.json(
        { error: 'Keine Videosegmente angegeben' },
        { status: 400 }
      );
    }

    if (!outputFileName) {
      return NextResponse.json(
        { error: 'Kein Ausgabedateiname angegeben' },
        { status: 400 }
      );
    }

    // Verbinde zur Datenbank
    await dbConnect();

    // Überprüfe, ob alle Videos existieren
    const videoIds = segments.map(segment => segment.videoId);
    const videos = await VideoModel.find({
      _id: { $in: videoIds },
      userId: session.user.id
    }).lean();

    if (videos.length !== segments.length) {
      return NextResponse.json(
        { error: 'Einige Videos wurden nicht gefunden' },
        { status: 404 }
      );
    }

    // Generiere signierte URLs für alle Videos
    const segmentsWithSignedUrls = await Promise.all(
      segments.map(async segment => {
        try {
          const signedUrl = await getSignedVideoUrl(segment.videoId);
          return {
            ...segment,
            url: signedUrl
          };
        } catch (error) {
          console.error(`Fehler beim Generieren der signierten URL für Video ${segment.videoId}:`, error);
          throw new Error(`Fehler beim Generieren der signierten URL für Video ${segment.videoId}`);
        }
      })
    );

    // Bereite die Segmente für die Verarbeitung vor
    const processedSegments = segmentsWithSignedUrls.map(segment => ({
      ...segment,
      startTime: Number(segment.startTime) || 0,
      duration: Number(segment.duration) || 0,
      position: Number(segment.position) || 0
    }));

    // Sortiere die Segmente nach Position
    processedSegments.sort((a, b) => a.position - b.position);

    console.log('Verarbeite Segmente:', {
      count: processedSegments.length,
      firstSegment: processedSegments[0]?.videoId,
      lastSegment: processedSegments[processedSegments.length - 1]?.videoId
    });

    // Starte den AWS Batch Job
    const jobResult = await submitAwsBatchJob(
      'generate-final',
      processedSegments[0].url,
      outputFileName,
      {
        VIDEO_SEGMENTS: JSON.stringify(processedSegments),
        VOICEOVER_URL: voiceoverUrl || '',
        USER_ID: session.user.id
      }
    );

    console.log('AWS Batch Job gestartet:', jobResult);

    // Speichere den Job in der Datenbank
    const job = new JobModel({
      jobId: jobResult.jobId,
      jobName: jobResult.jobName,
      userId: session.user.id,
      status: 'submitted',
      segments: processedSegments,
      voiceoverUrl,
      outputFileName,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await job.save();

    // Sende die Antwort
    return NextResponse.json({
      jobId: jobResult.jobId,
      jobName: jobResult.jobName,
      message: 'Video-Workflow wurde gestartet'
    });

  } catch (error) {
    console.error('Fehler im Video-Workflow:', error);
    
    // Detaillierte Fehlerinformationen
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      {
        error: 'Fehler beim Starten des Video-Workflows',
        message: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
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