import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import { BatchClient, DescribeJobsCommand } from '@aws-sdk/client-batch';

// AWS Batch Client
const batchClient = new BatchClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Spezielle Next.js-App-Router-Typisierungen
interface ProjectParams {
  id: string;
}

/**
 * API-Route zum Abfragen des Projekt-Status
 * GET /api/project-status/{id}
 */
export async function GET(
  request: Request,
  { params }: { params: ProjectParams }
) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = params.id;
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Datenbank verbinden
    await dbConnect();

    // Projekt finden
    const project = await ProjectModel.findOne({
      _id: projectId,
      userId: session.user.id
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Projekt-Status zurückgeben
    const response = {
      projectId: project._id,
      status: project.status,
      outputUrl: project.outputUrl || null,
      error: project.error || null,
      progress: 0
    };

    // Wenn der Status "processing" ist und ein Batch-Job-ID vorhanden ist,
    // dann den Job-Status von AWS Batch abfragen
    if (project.status === 'processing' && project.batchJobId) {
      try {
        const command = new DescribeJobsCommand({
          jobs: [project.batchJobId]
        });

        const { jobs } = await batchClient.send(command);
        const job = jobs?.[0];

        if (job) {
          // Status-Mapping von AWS Batch zu unserer Anwendung
          const statusMapping: Record<string, string> = {
            'SUBMITTED': 'processing',
            'PENDING': 'processing',
            'RUNNABLE': 'processing',
            'STARTING': 'processing',
            'RUNNING': 'processing',
            'SUCCEEDED': 'completed',
            'FAILED': 'failed'
          };

          // Status aktualisieren, wenn er sich geändert hat
          const newStatus = statusMapping[job.status || ''] || project.status;
          
          if (newStatus !== project.status) {
            project.status = newStatus;
            
            // Bei Fehler oder Erfolg auch entsprechende Felder aktualisieren
            if (newStatus === 'failed' && job.statusReason) {
              project.error = job.statusReason;
            }
            
            await project.save();
            response.status = newStatus;
          }

          // Fortschritt schätzen basierend auf der Laufzeit
          // (einfache Schätzung: von 0-100% über 2 Minuten)
          if (job.startedAt && job.status === 'RUNNING') {
            const startTime = typeof job.startedAt === 'number' 
              ? job.startedAt 
              : new Date(job.startedAt).getTime();
            const now = Date.now();
            const elapsedMs = now - startTime;
            const estimatedTotalTimeMs = 2 * 60 * 1000; // 2 Minuten
            const progress = Math.min(95, Math.floor((elapsedMs / estimatedTotalTimeMs) * 100));
            response.progress = progress;
          }
        }
      } catch (error) {
        console.error('Error fetching batch job status:', error);
        // Fehler beim Abrufen des Batch-Status, aber das Projekt bleibt trotzdem in "processing"
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error getting project status:', error);
    return NextResponse.json(
      { error: 'Failed to get project status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 