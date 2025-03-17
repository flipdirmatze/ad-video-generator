import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel, { IProject } from '@/models/Project';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import mongoose from 'mongoose';

// Erweitere den IProject-Typ für das Dokument aus MongoDB
interface IProjectDocument extends IProject {
  _id: mongoose.Types.ObjectId;
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

/**
 * GET /api/projects/[id]
 * Gibt ein einzelnes Projekt zurück
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    // Await the params Promise to get the id
    const { id: projectId } = await params;
    
    // Verbindung zur Datenbank herstellen
    await dbConnect();
    
    // Projekt des Benutzers abfragen
    const project = await ProjectModel.findOne({ 
      _id: projectId,
      userId 
    }).lean() as unknown as IProjectDocument;
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found or no permission' }, { status: 404 });
    }
    
    // Signierte URL generieren, wenn das Projekt abgeschlossen ist
    let signedUrl = undefined;
    if (project.status === 'completed' && project.outputUrl) {
      signedUrl = await getSignedVideoUrlFromS3(project.outputUrl);
    }
    
    // Rückmeldung formatieren
    const formattedProject = {
      id: project._id.toString(),
      title: project.title,
      status: project.status,
      outputUrl: project.outputUrl,
      signedUrl,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt
    };
    
    // Erfolg zurückgeben
    return NextResponse.json({
      success: true,
      project: formattedProject
    });
  } catch (error) {
    console.error('Error fetching project from database:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch project', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]
 * Löscht ein Projekt und die zugehörige Videodatei
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    // Await the params Promise to get the id
    const { id: projectId } = await params;
    
    // Verbindung zur Datenbank herstellen
    await dbConnect();
    
    // Projekt des Benutzers abfragen
    const project = await ProjectModel.findOne({ 
      _id: projectId,
      userId 
    }) as unknown as IProjectDocument;
    
    if (!project) {
      return NextResponse.json({ error: 'Project not found or no permission' }, { status: 404 });
    }
    
    // Wenn das Projekt eine Ausgabedatei hat, versuche diese aus S3 zu löschen
    if (project.outputUrl) {
      try {
        // Extrahiere den S3-Key aus der URL
        const s3Key = project.outputUrl.replace(`https://${bucketName}.s3.${process.env.AWS_REGION || 'eu-central-1'}.amazonaws.com/`, '');
        
        console.log(`Deleting file from S3: ${s3Key}`);
        
        const command = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: s3Key
        });
        
        await s3Client.send(command);
        console.log(`Successfully deleted file from S3: ${s3Key}`);
      } catch (s3Error) {
        // Fehler beim Löschen der Datei loggen, aber fortfahren
        console.error('Error deleting file from S3:', s3Error);
      }
    }
    
    // Projekt aus der Datenbank löschen
    await ProjectModel.deleteOne({ _id: projectId, userId });
    
    return NextResponse.json({
      success: true,
      message: 'Project deleted successfully',
      projectId
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete project', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 