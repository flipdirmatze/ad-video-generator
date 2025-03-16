import { NextRequest, NextResponse } from 'next/server';
import { BatchClient, SubmitJobCommand, DescribeJobsCommand } from '@aws-sdk/client-batch';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Konfiguriere AWS Batch-Client
const batchClient = new BatchClient({
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

// Gültige Job-Typen
const validJobTypes = ['trim', 'concat', 'voiceover', 'generate-final'];

/**
 * Verarbeitet POST-Anfragen zum Starten von AWS Batch-Jobs für Videobearbeitung
 */
export async function POST(request: NextRequest) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Extrahiere JSON-Daten aus der Anfrage
    const data = await request.json();
    const { jobType, inputVideoUrl, outputKey, additionalParams } = data;

    if (!jobType || !inputVideoUrl) {
      return NextResponse.json(
        { error: 'Missing parameters: jobType and inputVideoUrl are required' },
        { status: 400 }
      );
    }

    if (!validJobTypes.includes(jobType)) {
      return NextResponse.json(
        { error: `Invalid jobType. Allowed types: ${validJobTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Generiere einen eindeutigen Job-Namen
    const jobName = `video-${jobType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Bereite die Umgebungsvariablen für den Container vor
    const environment = [
      { name: 'JOB_TYPE', value: jobType },
      { name: 'INPUT_VIDEO_URL', value: inputVideoUrl },
      { name: 'USER_ID', value: session.user.id },
      { name: 'S3_BUCKET', value: process.env.S3_BUCKET_NAME || '' },
      { name: 'AWS_REGION', value: process.env.AWS_REGION || 'eu-central-1' }
    ];

    // Füge Output-Key hinzu, wenn vorhanden
    if (outputKey) {
      environment.push({ name: 'OUTPUT_KEY', value: outputKey });
    }

    // Füge zusätzliche Parameter hinzu
    if (additionalParams) {
      Object.entries(additionalParams).forEach(([key, value]) => {
        environment.push({
          name: key,
          value: typeof value === 'string' ? value : JSON.stringify(value)
        });
      });
    }

    // Erstelle den AWS Batch Job Command
    const command = new SubmitJobCommand({
      jobName,
      jobQueue: process.env.AWS_BATCH_JOB_QUEUE || '',
      jobDefinition: process.env.AWS_BATCH_JOB_DEFINITION || '',
      containerOverrides: {
        environment,
        memory: 2048, // 2GB RAM
        vcpus: 2     // 2 vCPUs
      }
    });

    // Sende den Job an AWS Batch
    const response = await batchClient.send(command);
    console.log('AWS Batch job submitted:', { jobId: response.jobId, jobName });

    // Gebe die Antwort mit der Job-ID zurück
    return NextResponse.json({
      jobId: response.jobId,
      jobName,
      status: 'submitted',
      message: 'Video processing job submitted to AWS Batch'
    });
  } catch (error) {
    console.error('Error starting AWS Batch job:', error);
    return NextResponse.json(
      { error: 'Failed to start video processing job', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * Verarbeitet GET-Anfragen zum Abrufen des Status eines AWS Batch-Jobs
 */
export async function GET(request: NextRequest) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing parameter: jobId is required' },
        { status: 400 }
      );
    }

    // Beschreibe den Job
    const command = new DescribeJobsCommand({
      jobs: [jobId]
    });

    const response = await batchClient.send(command);
    const job = response.jobs?.[0];

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Berechne den Fortschritt basierend auf dem Status
    let progress = 0;
    switch (job.status) {
      case 'SUBMITTED':
        progress = 0;
        break;
      case 'PENDING':
        progress = 5;
        break;
      case 'RUNNABLE':
        progress = 10;
        break;
      case 'STARTING':
        progress = 15;
        break;
      case 'RUNNING':
        // Schätze den Fortschritt basierend auf der verstrichenen Zeit
        const startedAt = job.startedAt ? new Date(job.startedAt).getTime() : Date.now();
        const now = Date.now();
        const elapsed = now - startedAt;
        // Nehme an, dass ein Job etwa 5 Minuten dauert
        progress = Math.min(90, Math.floor((elapsed / (5 * 60 * 1000)) * 100));
        break;
      case 'SUCCEEDED':
        progress = 100;
        break;
      case 'FAILED':
        progress = 0;
        break;
    }

    return NextResponse.json({
      jobId: job.jobId,
      jobName: job.jobName,
      status: job.status?.toLowerCase(),
      progress,
      startedAt: job.startedAt,
      stoppedAt: job.stoppedAt,
      exitCode: job.container?.exitCode,
      reason: job.container?.reason,
      error: job.statusReason
    });
  } catch (error) {
    console.error('Error fetching AWS Batch job status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch job status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
