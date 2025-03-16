import { NextRequest, NextResponse } from 'next/server';
import { BatchClient, SubmitJobCommand, DescribeJobsCommand } from '@aws-sdk/client-batch';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { BatchJobTypes } from '@/utils/aws-batch-utils';

// Konfiguriere AWS Batch-Client
const batchClient = new BatchClient({
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

// Validiere die erforderlichen Umgebungsvariablen
function validateEnvironment() {
  const requiredEnvVars = [
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_BATCH_JOB_QUEUE',
    'AWS_BATCH_JOB_DEFINITION',
    'S3_BUCKET_NAME'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

/**
 * Verarbeitet POST-Anfragen zum Starten von AWS Batch-Jobs für Videobearbeitung
 */
export async function POST(request: NextRequest) {
  try {
    // Validiere Umgebungsvariablen
    validateEnvironment();

    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.error('Unauthorized: No session or user ID');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Extrahiere JSON-Daten aus der Anfrage
    let data;
    try {
      data = await request.json();
      console.log('Received job request:', JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to parse request data:', error);
      return NextResponse.json({
        error: 'Invalid request data',
        details: error instanceof Error ? error.message : 'Failed to parse JSON'
      }, { status: 400 });
    }

    const { jobType, inputVideoUrl, outputKey, additionalParams } = data;

    // Validiere erforderliche Parameter
    if (!jobType || !inputVideoUrl) {
      console.error('Missing required parameters:', { jobType, inputVideoUrl });
      return NextResponse.json(
        { 
          error: 'Missing parameters: jobType and inputVideoUrl are required',
          details: {
            missingParams: {
              jobType: !jobType,
              inputVideoUrl: !inputVideoUrl
            }
          }
        },
        { status: 400 }
      );
    }

    // Validiere Job-Typ
    const validJobTypes = Object.values(BatchJobTypes);
    if (!validJobTypes.includes(jobType)) {
      console.error('Invalid job type:', jobType);
      return NextResponse.json(
        { 
          error: 'Invalid job type',
          details: {
            provided: jobType,
            allowed: validJobTypes
          }
        },
        { status: 400 }
      );
    }

    // Generiere einen eindeutigen Job-Namen
    const jobName = `video-${jobType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    console.log('Generated job name:', jobName);

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

    console.log('Prepared environment variables:', environment);

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
    let jobResponse;
    try {
      jobResponse = await batchClient.send(command);
      console.log('AWS Batch job submitted:', { jobId: jobResponse.jobId, jobName });
    } catch (error) {
      console.error('AWS Batch API error:', error);
      return NextResponse.json({
        error: 'Failed to submit job to AWS Batch',
        details: error instanceof Error ? error.message : 'Unknown AWS Batch error'
      }, { status: 500 });
    }

    // Gebe die Antwort mit der Job-ID zurück
    return NextResponse.json({
      jobId: jobResponse.jobId,
      jobName,
      status: 'submitted',
      message: 'Video processing job submitted to AWS Batch'
    });
  } catch (error) {
    console.error('Unhandled error in AWS Batch job submission:', error);
    return NextResponse.json(
      { 
        error: 'Failed to start video processing job',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

/**
 * Verarbeitet GET-Anfragen zum Abrufen des Status eines AWS Batch-Jobs
 */
export async function GET(request: NextRequest) {
  try {
    // Validiere Umgebungsvariablen
    validateEnvironment();

    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.error('Unauthorized: No session or user ID');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      console.error('Missing jobId parameter');
      return NextResponse.json(
        { error: 'Missing parameter: jobId is required' },
        { status: 400 }
      );
    }

    console.log('Fetching status for job:', jobId);

    // Beschreibe den Job
    let jobStatusResponse;
    try {
      const command = new DescribeJobsCommand({
        jobs: [jobId]
      });

      jobStatusResponse = await batchClient.send(command);
    } catch (error) {
      console.error('AWS Batch API error:', error);
      return NextResponse.json({
        error: 'Failed to fetch job status from AWS Batch',
        details: error instanceof Error ? error.message : 'Unknown AWS Batch error'
      }, { status: 500 });
    }

    const job = jobStatusResponse.jobs?.[0];

    if (!job) {
      console.error('Job not found:', jobId);
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Berechne den Fortschritt basierend auf dem Status
    let progress = 0;
    let startedAt = 0;
    let now = 0;
    let elapsed = 0;

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
        startedAt = job.startedAt ? new Date(job.startedAt).getTime() : Date.now();
        now = Date.now();
        elapsed = now - startedAt;
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

    const jobStatus = {
      jobId: job.jobId,
      jobName: job.jobName,
      status: job.status?.toLowerCase(),
      progress,
      startedAt: job.startedAt,
      stoppedAt: job.stoppedAt,
      exitCode: job.container?.exitCode,
      reason: job.container?.reason,
      error: job.statusReason
    };

    console.log('Job status:', jobStatus);

    return NextResponse.json(jobStatus);
  } catch (error) {
    console.error('Unhandled error in job status fetch:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch job status',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
