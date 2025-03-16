import { NextRequest, NextResponse } from 'next/server';
import { BatchClient, SubmitJobCommand } from '@aws-sdk/client-batch';

// Validiere die erforderlichen Umgebungsvariablen
const requiredEnvVars = [
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_BATCH_JOB_DEFINITION',
  'AWS_BATCH_JOB_QUEUE',
  'S3_BUCKET_NAME'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`Fehlende Umgebungsvariablen: ${missingEnvVars.join(', ')}`);
  throw new Error(`Fehlende Umgebungsvariablen: ${missingEnvVars.join(', ')}`);
}

// Konfiguriere AWS Batch-Client
const batchClient = new BatchClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

/**
 * Verarbeitet POST-Anfragen zum Starten von AWS Batch-Jobs für Videobearbeitung
 */
export async function POST(request: NextRequest) {
  try {
    // Extrahiere JSON-Daten aus der Anfrage
    const data = await request.json();
    const { jobType, inputVideoUrl, outputKey, additionalParams } = data;

    console.log('Starte AWS Batch Job mit Parametern:', {
      jobType,
      inputVideoUrl,
      outputKey,
      additionalParamsKeys: additionalParams ? Object.keys(additionalParams) : []
    });

    if (!jobType || !inputVideoUrl) {
      return NextResponse.json(
        { error: 'Fehlende Parameter: jobType und inputVideoUrl sind erforderlich' },
        { status: 400 }
      );
    }

    // Validiere die Job-Typen
    const validJobTypes = ['concat', 'trim', 'add-voiceover', 'generate-final'];
    if (!validJobTypes.includes(jobType)) {
      return NextResponse.json(
        { error: `Ungültiger jobType. Erlaubte Typen: ${validJobTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Erstelle ein gemeinsames Umgebungsobjekt für den Job
    const environmentVariables = [
      { name: 'JOB_TYPE', value: jobType },
      { name: 'INPUT_VIDEO_URL', value: inputVideoUrl },
      { name: 'OUTPUT_BUCKET', value: process.env.S3_BUCKET_NAME },
      { name: 'OUTPUT_KEY', value: outputKey || `processed/${Date.now()}-${jobType}.mp4` },
      { name: 'AWS_REGION', value: process.env.AWS_REGION },
      { name: 'BATCH_CALLBACK_URL', value: process.env.BATCH_CALLBACK_URL || '' },
      { name: 'BATCH_CALLBACK_SECRET', value: process.env.BATCH_CALLBACK_SECRET || '' }
    ];

    // Füge alle zusätzlichen Parameter als Umgebungsvariablen hinzu
    if (additionalParams) {
      Object.entries(additionalParams).forEach(([key, value]) => {
        environmentVariables.push({
          name: key.toUpperCase(),
          value: typeof value === 'string' ? value : JSON.stringify(value)
        });
      });
    }

    // Verwende die Standard-Jobdefinition
    const jobDefinition = process.env.AWS_BATCH_JOB_DEFINITION!;
    const jobQueue = process.env.AWS_BATCH_JOB_QUEUE!;

    // Erstelle einen eindeutigen Job-Namen
    const jobName = `${jobType}-${Date.now()}`;

    console.log('Sende AWS Batch Job mit Konfiguration:', {
      jobName,
      jobQueue,
      jobDefinition,
      environmentVariablesCount: environmentVariables.length
    });

    // Erstelle den Submit-Job-Befehl
    const command = new SubmitJobCommand({
      jobName,
      jobQueue,
      jobDefinition,
      containerOverrides: {
        environment: environmentVariables
      }
    });

    // Sende den Job an AWS Batch
    const response = await batchClient.send(command);

    console.log('AWS Batch Job erfolgreich gesendet:', {
      jobId: response.jobId,
      jobName
    });

    // Gebe die Antwort mit der Job-ID zurück
    return NextResponse.json({
      jobId: response.jobId,
      jobName,
      status: 'submitted',
      message: 'Video-Verarbeitungsjob wurde an AWS Batch gesendet'
    });
  } catch (error) {
    console.error('Fehler beim Starten des AWS Batch-Jobs:', error);
    
    // Detaillierte Fehlerinformationen
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      { 
        error: 'Fehler beim Starten des Video-Verarbeitungsjobs',
        message: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
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
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Fehlender Parameter: jobId ist erforderlich' },
        { status: 400 }
      );
    }

    // Hier würden wir den Status des Jobs von AWS Batch abrufen
    return NextResponse.json({
      message: 'Diese Funktion ist noch nicht implementiert. Sie würde den Status des Jobs abrufen.',
      jobId
    });
  } catch (error) {
    console.error('Fehler beim Abrufen des AWS Batch-Job-Status:', error);
    return NextResponse.json(
      { error: 'Fehler beim Abrufen des Job-Status', details: (error as Error).message },
      { status: 500 }
    );
  }
}
