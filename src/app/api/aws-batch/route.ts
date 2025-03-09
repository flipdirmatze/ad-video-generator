import { NextRequest, NextResponse } from 'next/server';
import { BatchClient, SubmitJobCommand } from '@aws-sdk/client-batch';

// Konfiguriere AWS Batch-Client
const batchClient = new BatchClient({
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

/**
 * Verarbeitet POST-Anfragen zum Starten von AWS Batch-Jobs für Videobearbeitung
 */
export async function POST(request: NextRequest) {
  try {
    // Extrahiere JSON-Daten aus der Anfrage
    const data = await request.json();
    const { jobType, inputVideoUrl, outputBucket, outputKey, additionalParams } = data;

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
      { name: 'OUTPUT_BUCKET', value: outputBucket || process.env.S3_BUCKET_NAME },
      { name: 'OUTPUT_KEY', value: outputKey || `processed/${Date.now()}-${jobType}.mp4` }
    ];

    // Füge alle zusätzlichen Parameter als Umgebungsvariablen hinzu
    if (additionalParams) {
      Object.entries(additionalParams).forEach(([key, value]) => {
        environmentVariables.push({
          name: key.toUpperCase(),
          value: String(value)
        });
      });
    }

    // Konfiguriere die Auftragsdefinition basierend auf dem Job-Typ
    let jobDefinition = process.env.AWS_BATCH_JOB_DEFINITION || 'video-processing-job';
    let jobQueue = process.env.AWS_BATCH_JOB_QUEUE || 'video-processing-queue';

    // Spezifische Jobdefinitionen für verschiedene Verarbeitungstypen
    switch (jobType) {
      case 'generate-final':
        jobDefinition = process.env.AWS_BATCH_FINAL_JOB_DEFINITION || jobDefinition;
        break;
      case 'add-voiceover':
        jobDefinition = process.env.AWS_BATCH_VOICEOVER_JOB_DEFINITION || jobDefinition;
        break;
      // Weitere Job-Typen können hier hinzugefügt werden
    }

    // Erstelle einen eindeutigen Job-Namen
    const jobName = `${jobType}-${Date.now()}`;

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

    // Gebe die Antwort mit der Job-ID zurück
    return NextResponse.json({
      jobId: response.jobId,
      jobName,
      status: 'submitted',
      message: 'Video-Verarbeitungsjob wurde an AWS Batch gesendet'
    });
  } catch (error) {
    console.error('Fehler beim Starten des AWS Batch-Jobs:', error);
    return NextResponse.json(
      { error: 'Fehler beim Starten des Video-Verarbeitungsjobs', details: (error as Error).message },
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
    // Für diese Demo geben wir einfach zurück, dass wir den Job überprüfen würden
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
