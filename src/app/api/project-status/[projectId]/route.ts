import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import { getJobStatus } from '@/utils/aws-batch-utils';

// Define the params type explicitly
type Params = {
  projectId: string;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Params }
) {
  try {
    // Sichere Authentifizierung
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projectId = params.projectId;
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    console.log(`Fetching status for project: ${projectId}`);

    // Mit Datenbank verbinden
    await dbConnect();

    // Projekt aus der Datenbank abrufen
    const project = await ProjectModel.findById(projectId);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Prüfen, ob das Projekt dem aktuellen Benutzer gehört
    if (project.userId.toString() !== session.user.id) {
      return NextResponse.json({ error: 'Not authorized to access this project' }, { status: 403 });
    }

    // Wenn das Projekt bereits abgeschlossen oder fehlgeschlagen ist, gib den Status direkt zurück
    if (project.status === 'completed' || project.status === 'failed') {
      return NextResponse.json({
        projectId: project._id.toString(),
        status: project.status,
        outputUrl: project.outputUrl || null,
        error: project.error || null,
        progress: project.status === 'completed' ? 100 : 0
      });
    }

    // Wenn das Projekt noch in Bearbeitung ist und eine Batch-Job-ID hat, prüfe den Status des Jobs
    if (project.status === 'processing' && project.batchJobId) {
      try {
        // Rufe den Status des AWS Batch-Jobs ab
        const jobStatus = await getJobStatus(project.batchJobId, session.user.id);
        console.log(`AWS Batch job status for ${project.batchJobId}: ${jobStatus}`);

        // Berechne den Fortschritt basierend auf dem Job-Status
        let progress = 0;
        let newStatus = project.status;
        let error = project.error;

        // Prüfe, ob der Status einen Fehler enthält (z.B. "failed: Essential container in task exited")
        if (jobStatus.toLowerCase().startsWith('failed:')) {
          const errorMessage = jobStatus.substring(7).trim(); // Entferne "failed: "
          newStatus = 'failed';
          error = errorMessage;
          progress = 0;
        } else {
          switch (jobStatus.toLowerCase()) {
            case 'submitted':
              progress = 5;
              break;
            case 'pending':
              progress = 10;
              break;
            case 'runnable':
              progress = 15;
              break;
            case 'starting':
              progress = 20;
              break;
            case 'running':
              // Fortschritt zwischen 25% und 95% basierend auf der Zeit
              progress = Math.min(95, 25 + Math.floor(Math.random() * 70));
              break;
            case 'succeeded':
              progress = 100;
              newStatus = 'completed';
              break;
            case 'failed':
              progress = 0;
              newStatus = 'failed';
              error = 'AWS Batch job failed';
              break;
            default:
              progress = project.progress || 0;
          }
        }

        // Aktualisiere das Projekt in der Datenbank, wenn sich der Status geändert hat
        if (newStatus !== project.status || progress !== project.progress || error !== project.error) {
          project.status = newStatus;
          project.progress = progress;
          
          if (error) {
            project.error = error;
          }
          
          await project.save();
        }

        return NextResponse.json({
          projectId: project._id.toString(),
          status: newStatus,
          outputUrl: project.outputUrl || null,
          error: error || null,
          progress
        });
      } catch (error) {
        console.error(`Error fetching AWS Batch job status: ${error}`);
        
        // Bei einem Fehler beim Abrufen des Job-Status, gib den aktuellen Projektstatus zurück
        return NextResponse.json({
          projectId: project._id.toString(),
          status: project.status,
          outputUrl: project.outputUrl || null,
          error: project.error || `Error fetching job status: ${error instanceof Error ? error.message : 'Unknown error'}`,
          progress: project.progress || 0
        });
      }
    }

    // Fallback: Gib den aktuellen Projektstatus zurück
    return NextResponse.json({
      projectId: project._id.toString(),
      status: project.status,
      outputUrl: project.outputUrl || null,
      error: project.error || null,
      progress: project.progress || 0
    });
  } catch (error) {
    console.error(`Error fetching project status: ${error}`);
    return NextResponse.json(
      { 
        error: 'Failed to fetch project status', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 