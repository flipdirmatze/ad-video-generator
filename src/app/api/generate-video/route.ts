import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import Voiceover from '@/models/Voiceover';
import { generateUniqueFileName } from '@/lib/storage';

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

export async function POST(request: Request) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Request-Daten holen
    const data: VideoGenerationRequest = await request.json();
    const { segments, voiceoverId, title = 'Mein Video' } = data;

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return NextResponse.json({ error: 'Video segments are required' }, { status: 400 });
    }

    // Datenbank verbinden
    await dbConnect();
    
    // Voiceover-Datei finden, wenn eine ID angegeben ist
    let voiceoverKey: string | undefined;
    if (voiceoverId) {
      const voiceover = await Voiceover.findOne({
        _id: voiceoverId,
        userId: session.user.id
      });
      
      if (voiceover) {
        voiceoverKey = voiceover.path;
      } else {
        return NextResponse.json({ error: 'Voiceover not found' }, { status: 404 });
      }
    }

    // Ausgabedateinamen generieren
    const outputFileName = generateUniqueFileName(`${title.toLowerCase().replace(/\s+/g, '-')}.mp4`);
    const outputKey = `final/${session.user.id}/${outputFileName}`;

    // Statt direkt AWS Batch aufzurufen, verwenden wir den neuen Workflow-API
    const workflowResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/video-workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workflowType: 'video_generation',
        userId: session.user.id,
        title: title,
        data: {
          segments: segments.map(segment => ({
            videoKey: segment.videoKey,
            startTime: segment.startTime,
            duration: segment.duration,
            position: segment.position
          })),
          voiceoverKey: voiceoverKey,
          outputKey: outputKey
        }
      })
    });

    if (!workflowResponse.ok) {
      const errorData = await workflowResponse.json();
      throw new Error(errorData.message || 'Fehler beim Starten des Video-Workflows');
    }

    const workflowData = await workflowResponse.json();

    // Wir geben die gleiche Antwort zurück, damit bestehende Clients nicht geändert werden müssen
    return NextResponse.json({
      success: true,
      message: 'Video generation started',
      projectId: workflowData.projectId,
      jobId: workflowData.jobId,
      jobName: workflowData.jobName,
      estimatedTime: "Your video will be processed and will be ready in a few minutes"
    });
  } catch (error) {
    console.error('Error generating video:', error);
    return NextResponse.json(
      { error: 'Failed to generate video', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 