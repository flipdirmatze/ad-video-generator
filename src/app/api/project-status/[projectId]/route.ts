import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel, { IProject } from '@/models/Project';
import { getJobStatusDirect } from '@/utils/aws-batch-utils';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';

// Definiere den Projektstatus-Typ
type ProjectStatus = 'pending' | 'processing' | 'completed' | 'failed';

// Erweitere den IProject-Typ für das Dokument aus MongoDB
interface IProjectDocument extends Omit<IProject, 'status'> {
  _id: mongoose.Types.ObjectId;
  status: ProjectStatus;
  progress?: number;
  batchJobId?: string;
  jobId?: string;
  save(): Promise<IProjectDocument>;
}

// S3 Client initialisieren
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

// Bucket Name aus Umgebungsvariablen
const bucketName = process.env.S3_BUCKET_NAME || 'ad-video-generator-bucket';

// Funktion zum Generieren einer signierten URL für ein Video
async function getSignedVideoUrlFromS3(outputUrl: string): Promise<string> {
  try {
    // Extrahiere den S3-Key aus der URL
    const s3Key = outputUrl.replace(`https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-central-1'}.amazonaws.com/`, '');
    
    console.log(`Generating signed URL for S3 key: ${s3Key}`);
    
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: s3Key
    });
    
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // 1 Stunde gültig
    console.log(`Generated signed URL for video: ${s3Key}`);
    return signedUrl;
  } catch (error) {
    console.error(`Error generating signed URL:`, error);
    // Fallback zur Original-URL
    return outputUrl;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    // Sichere Authentifizierung
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Await the params Promise to get the projectId
    const { projectId } = await params;
    
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    console.log(`Fetching status for project: ${projectId}`);

    // Mit Datenbank verbinden
    await dbConnect();

    // Projekt aus der Datenbank abrufen
    const project = await ProjectModel.findById(projectId) as unknown as IProjectDocument;
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Prüfen, ob das Projekt dem aktuellen Benutzer gehört
    if (project.userId.toString() !== session.user.id) {
      return NextResponse.json({ error: 'Not authorized to access this project' }, { status: 403 });
    }

    // Wenn das Projekt bereits abgeschlossen ist, generiere eine signierte URL für das Video
    if (project.status === 'completed' && project.outputUrl) {
      const signedUrl = await getSignedVideoUrlFromS3(project.outputUrl);
      console.log(`[Project Status API] Generated Signed URL for completed project ${projectId}: ${signedUrl}`);
      
      return NextResponse.json({
        projectId: project._id.toString(),
        status: project.status,
        outputUrl: project.outputUrl,
        signedUrl: signedUrl, // Füge die signierte URL hinzu
        error: project.error || null,
        progress: 100
      });
    }
    
    // Wenn das Projekt fehlgeschlagen ist, gib den Status direkt zurück
    if (project.status === 'failed') {
      return NextResponse.json({
        projectId: project._id.toString(),
        status: project.status,
        outputUrl: project.outputUrl || null,
        error: project.error || null,
        progress: 0
      });
    }

    // Wenn das Projekt noch in Bearbeitung ist und eine Batch-Job-ID hat, prüfe den Status des Jobs
    if (project.status === 'processing' && (project.batchJobId || project.jobId)) {
      try {
        // Verwende entweder batchJobId oder jobId
        const jobIdToUse = project.batchJobId || project.jobId;
        
        if (!jobIdToUse) {
          console.warn(`No job ID found for project ${project._id}`);
          return NextResponse.json({
            projectId: project._id.toString(),
            status: project.status,
            outputUrl: project.outputUrl || null,
            error: 'No job ID found for project',
            progress: project.progress || 0
          });
        }
        
        // Hole den aktuellen Job-Status von AWS Batch
        const jobStatus = await getJobStatusDirect(jobIdToUse);
        console.log(`AWS Batch job status for ${jobIdToUse}: ${jobStatus}`);

        // Berechne den Fortschritt basierend auf dem Job-Status
        let progress = 0;
        let newStatus: ProjectStatus = project.status;
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

        // Wenn der Job erfolgreich abgeschlossen wurde und eine Output-URL vorhanden ist,
        // generiere eine signierte URL
        if (newStatus === 'completed' && project.outputUrl) {
          const signedUrl = await getSignedVideoUrlFromS3(project.outputUrl);
          console.log(`[Project Status API] Generated Signed URL for updated project ${projectId}: ${signedUrl}`);
          
          return NextResponse.json({
            projectId: project._id.toString(),
            status: newStatus,
            outputUrl: project.outputUrl,
            signedUrl: signedUrl, // Füge die signierte URL hinzu
            error: error || null,
            progress
          });
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