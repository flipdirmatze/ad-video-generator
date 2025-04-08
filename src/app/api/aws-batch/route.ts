import { NextRequest, NextResponse } from 'next/server';
import { BatchClient, SubmitJobCommand, DescribeJobsCommand } from '@aws-sdk/client-batch';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { BatchJobTypes } from '@/utils/aws-batch-utils';

// Konfiguriere AWS Batch-Client mit detailliertem Logging
const createBatchClient = () => {
  console.log('Creating AWS Batch client with region:', process.env.AWS_REGION || 'eu-central-1');
  
  try {
    return new BatchClient({
      region: process.env.AWS_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
      }
    });
  } catch (error) {
    console.error('Error creating AWS Batch client:', error);
    throw error;
  }
};

// Erstelle den Client nur einmal
let batchClient: BatchClient;
try {
  batchClient = createBatchClient();
} catch (error) {
  console.error('Failed to initialize AWS Batch client:', error);
  // Wir erstellen den Client später bei Bedarf
}

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
    console.error('Missing required environment variables:', missingVars);
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
  
  // Logge die Werte der Umgebungsvariablen (ohne sensible Daten)
  console.log('Environment validation successful with the following values:');
  console.log('AWS_REGION:', process.env.AWS_REGION);
  console.log('AWS_BATCH_JOB_QUEUE:', process.env.AWS_BATCH_JOB_QUEUE);
  console.log('AWS_BATCH_JOB_DEFINITION:', process.env.AWS_BATCH_JOB_DEFINITION);
  console.log('S3_BUCKET_NAME:', process.env.S3_BUCKET_NAME);
  console.log('AWS_BATCH_CONTAINER_IMAGE:', process.env.AWS_BATCH_CONTAINER_IMAGE);
}

/**
 * Verarbeitet POST-Anfragen zum Starten von AWS Batch-Jobs für Videobearbeitung
 */
export async function POST(request: NextRequest) {
  console.log('AWS Batch POST request received');
  
  try {
    // Validiere Umgebungsvariablen
    validateEnvironment();

    // Stelle sicher, dass der Batch-Client existiert
    if (!batchClient) {
      console.log('Initializing AWS Batch client on demand');
      batchClient = createBatchClient();
    }

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

    // Validiere die Input-URL
    if (!inputVideoUrl.startsWith('http')) {
      console.error('Invalid input video URL:', inputVideoUrl);
      return NextResponse.json(
        { 
          error: 'Invalid input video URL',
          details: {
            provided: inputVideoUrl,
            expected: 'URL starting with http:// or https://'
          }
        },
        { status: 400 }
      );
    }

    // Generiere einen eindeutigen Job-Namen
    const jobName = `video-${jobType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    console.log('Generated job name:', jobName);

    // Erstelle eine Liste von Umgebungsvariablen
    let environment: { name: string; value: string }[] = [];
    
    // Füge Basis-Umgebungsvariablen hinzu
    environment.push({ name: 'JOB_TYPE', value: jobType });
    environment.push({ name: 'INPUT_VIDEO_URL', value: inputVideoUrl });
    environment.push({ name: 'USER_ID', value: userId });
    environment.push({ name: 'S3_BUCKET', value: process.env.S3_BUCKET_NAME || '' });
    environment.push({ name: 'AWS_REGION', value: process.env.AWS_REGION || 'eu-central-1' });
    
    // Setze "Enabled" auf true, um Callback-Integration für den Status zu aktivieren
    environment.push({
      name: 'BATCH_CALLBACK_ENABLED',
      value: 'true'
    });

    // Füge Output-Key hinzu, wenn vorhanden
    if (outputKey) {
      environment.push({ name: 'OUTPUT_KEY', value: outputKey });
    }

    // Extrahiere Umgebungsvariablen aus zusätzlichen Parametern
    if (additionalParams) {
      console.log('Processing additional parameters');
      const maxEnvVarLength = 4000; // AWS Batch hat ein Limit für die Umgebungsvariablenlänge
      
      // Erstelle Liste von sicheren Parameternamen, die direkt übergeben werden können
      const safeKeysToPassDirectly = [
        'USER_ID', 'PROJECT_ID', 'TITLE', 'TEMPLATE_DATA_PATH', 'TEMPLATE_DATA', 'VOICEOVER_URL',
        'DEBUG', 'AWS_REGION', 'OUTPUT_KEY', 'WORD_TIMESTAMPS', 'VOICEOVER_ID', 'VOICEOVER_KEY'
      ];
      
      // Filtere und verarbeite die Parameter
      Object.entries(additionalParams).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          console.log(`Skipping null/undefined value for key: ${key}`);
          return;
        }
        
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
        
        // Prüfe, ob wir diesen Parameter direkt übergeben sollten
        const isSafeKey = safeKeysToPassDirectly.includes(key);
        const isPathReference = key.endsWith('_PATH') || key.endsWith('_KEY');
        
        // Prüfe die Größe des Werts
        if (stringValue.length > maxEnvVarLength) {
          console.warn(`Value for ${key} exceeds ${maxEnvVarLength} chars (${stringValue.length} bytes)`);
          
          // Wenn es eine Pfadreferenz ist, können wir sie übergeben
          if (isPathReference) {
            console.log(`Using S3 path reference for ${key}: ${stringValue.substring(0, 50)}...`);
            environment.push({
              name: key,
              value: stringValue
            });
          } else {
            console.log(`Skipping large parameter ${key} (${stringValue.length} bytes)`);
          }
        } else if (isSafeKey || isPathReference || stringValue.length < 1000) {
          // Sichere Schlüssel, Pfadreferenzen oder kleine Werte direkt übergeben
          environment.push({
            name: key,
            value: stringValue
          });
        } else {
          console.log(`Skipping non-essential parameter ${key} (${stringValue.length} bytes)`);
        }
      });

      // Stelle sicher, dass TEMPLATE_DATA in den Umgebungsvariablen enthalten ist
      const hasTemplateData = environment.some(env => env.name === 'TEMPLATE_DATA');
      if (!hasTemplateData && additionalParams?.TEMPLATE_DATA) {
        console.log('Adding TEMPLATE_DATA to environment variables directly');
        const templateDataValue = typeof additionalParams.TEMPLATE_DATA === 'string' 
          ? additionalParams.TEMPLATE_DATA 
          : JSON.stringify(additionalParams.TEMPLATE_DATA);
        
        environment.push({
          name: 'TEMPLATE_DATA',
          value: templateDataValue
        });
      }
    }

    console.log('Prepared environment variables:', environment);
    
    // Überprüfe die Gesamtgröße der Umgebungsvariablen
    const totalSize = environment.reduce((sum, env) => sum + (env.name.length + (env.value?.length || 0)), 0);
    console.log(`Total environment variables size: ${totalSize} bytes`);
    
    // Warnung ausgeben, wenn sich der Gesamtwert dem AWS-Limit nähert
    const awsLimit = 8000; // AWS Batch Container Overrides haben ein Limit von etwa 8192 Bytes
    if (totalSize > awsLimit * 0.8) {
      console.warn(`Environment variables size (${totalSize}) is approaching AWS limit (${awsLimit})!`);
      
      // Bei Überschreitung: Entferne nicht essentielle Variablen
      if (totalSize > awsLimit) {
        console.error(`Environment variables exceed AWS limit! Removing non-essential variables.`);
        
        // Sortiere die Variablen nach Wichtigkeit und Größe
        const sortedEnvironment = environment
          .map(env => ({ 
            env, 
            isEssential: ['USER_ID', 'PROJECT_ID', 'TEMPLATE_DATA_PATH', 'TEMPLATE_DATA'].includes(env.name),
            size: (env.name.length + (env.value?.length || 0))
          }))
          .sort((a, b) => {
            // Essentielle Variablen immer zuerst behalten
            if (a.isEssential && !b.isEssential) return -1;
            if (!a.isEssential && b.isEssential) return 1;
            // Bei gleicher Wichtigkeit: Kleinere Variablen bevorzugen
            return a.size - b.size;
          });
        
        // Behalte nur so viele Variablen wie möglich ohne das Limit zu überschreiten
        let currentSize = 0;
        environment = [];
        
        for (const item of sortedEnvironment) {
          const itemSize = item.size;
          if (currentSize + itemSize <= awsLimit) {
            environment.push(item.env);
            currentSize += itemSize;
          } else if (item.isEssential) {
            // Essentielle Variablen immer behalten, auch wenn das Limit überschritten wird
            environment.push(item.env);
            currentSize += itemSize;
            console.warn(`Including essential variable ${item.env.name} despite size (${itemSize} bytes)`);
          } else {
            console.warn(`Excluding variable ${item.env.name} to stay under limit (${itemSize} bytes)`);
          }
        }
        
        // Neue Gesamtgröße loggen
        const newTotalSize = environment.reduce((sum, env) => sum + (env.name.length + (env.value?.length || 0)), 0);
        console.log(`New environment variables size after optimization: ${newTotalSize} bytes`);
      }
    }

    console.log('Using job queue:', process.env.AWS_BATCH_JOB_QUEUE);
    console.log('Using job definition:', process.env.AWS_BATCH_JOB_DEFINITION);

    // Erstelle den AWS Batch Job Command für Fargate
    // Die Ressourcendefinitionen werden aus der Job-Definition übernommen
    const command = new SubmitJobCommand({
      jobName,
      jobQueue: process.env.AWS_BATCH_JOB_QUEUE || '',
      jobDefinition: process.env.AWS_BATCH_JOB_DEFINITION || '',
      containerOverrides: {
        // Nur Umgebungsvariablen übergeben, keine Ressourcenanforderungen
        environment
      }
    });

    // Sende den Job an AWS Batch
    let jobResponse;
    try {
      console.log('Sending job to AWS Batch with command:', {
        jobName,
        jobQueue: process.env.AWS_BATCH_JOB_QUEUE,
        jobDefinition: process.env.AWS_BATCH_JOB_DEFINITION,
        containerOverrides: {
          environmentCount: environment.length
        }
      });
      
      // Log environment variables for debugging (excluding sensitive data)
      const safeEnvironment = environment.map(env => {
        // Don't log sensitive values
        if (['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'BATCH_CALLBACK_SECRET'].includes(env.name)) {
          return { name: env.name, value: '***REDACTED***' };
        }
        // Truncate long values
        if (env.value && env.value.length > 100) {
          return { name: env.name, value: `${env.value.substring(0, 100)}... (truncated, total length: ${env.value.length})` };
        }
        return env;
      });
      
      console.log('Environment variables for job:', safeEnvironment);
      
      jobResponse = await batchClient.send(command);
      console.log('AWS Batch job submitted successfully:', { jobId: jobResponse.jobId, jobName });
      
      // Add additional information to the response
      const response = {
        jobId: jobResponse.jobId,
        jobName,
        status: 'submitted',
        message: 'Video processing job submitted to AWS Batch',
        submittedAt: new Date().toISOString(),
        // Include information about how to check job status
        statusUrl: `/api/aws-batch?jobId=${jobResponse.jobId}`,
        logsUrl: `/api/aws-batch-logs/${jobResponse.jobId}`
      };
      
      return NextResponse.json(response);
    } catch (error) {
      console.error('AWS Batch API error:', error);
      
      // Detaillierte Fehlerinformationen
      let errorDetails = 'Unknown AWS Batch error';
      let statusCode = 500;
      
      if (error instanceof Error) {
        errorDetails = error.message;
        
        // Logge den vollständigen Fehler für Debugging-Zwecke
        console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
        
        if ('$metadata' in error) {
          // Typensichere Behandlung des Metadata-Objekts
          const metadata = error as { $metadata?: { httpStatusCode?: number } };
          if (metadata.$metadata?.httpStatusCode) {
            statusCode = metadata.$metadata.httpStatusCode;
            errorDetails += ` (Status: ${metadata.$metadata.httpStatusCode})`;
          }
        }
        
        // Check for common AWS Batch errors
        if (error.message.includes('The specified job definition does not exist')) {
          errorDetails = `Job definition not found: ${process.env.AWS_BATCH_JOB_DEFINITION}`;
          console.error('Job definition error:', {
            definitionName: process.env.AWS_BATCH_JOB_DEFINITION,
            region: process.env.AWS_REGION
          });
        } else if (error.message.includes('The specified job queue does not exist')) {
          errorDetails = `Job queue not found: ${process.env.AWS_BATCH_JOB_QUEUE}`;
          console.error('Job queue error:', {
            queueName: process.env.AWS_BATCH_JOB_QUEUE,
            region: process.env.AWS_REGION
          });
        }
      }
      
      return NextResponse.json({
        error: 'Failed to submit job to AWS Batch',
        details: errorDetails,
        statusCode
      }, { status: statusCode });
    }
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
