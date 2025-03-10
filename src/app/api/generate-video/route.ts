import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createCompleteVideoJob, VideoSegmentParams } from '@/lib/aws-batch';
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

    // Segmente für AWS Batch formatieren
    const videoSegments: VideoSegmentParams[] = segments.map(segment => ({
      videoKey: segment.videoKey,
      startTime: segment.startTime,
      duration: segment.duration,
      position: segment.position
    }));

    // Projekt in Datenbank anlegen
    const project = new ProjectModel({
      userId: session.user.id,
      title: title,
      status: 'processing',
      segments: segments,
      voiceoverId: voiceoverId || null,
      outputKey,
      outputUrl: null, // Wird später aktualisiert, wenn das Video fertig ist
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Batch-Job starten
    const { jobId, jobName } = await createCompleteVideoJob(
      videoSegments,
      outputKey,
      voiceoverKey,
      session.user.id
    );

    // Projekt mit Job-Informationen aktualisieren
    project.batchJobId = jobId;
    project.batchJobName = jobName;
    await project.save();

    return NextResponse.json({
      success: true,
      message: 'Video generation started',
      projectId: project._id,
      jobId,
      jobName,
      estimatedTime: "Your video will be processed on AWS Batch and will be ready in a few minutes"
    });
  } catch (error) {
    console.error('Error generating video:', error);
    return NextResponse.json(
      { error: 'Failed to generate video', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 