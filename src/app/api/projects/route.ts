import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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
 * GET /api/projects
 * Gibt alle Projekte des aktuell eingeloggten Benutzers zurück
 */
export async function GET(request: NextRequest) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    
    // Verbindung zur Datenbank herstellen
    await dbConnect();
    
    // Projekte des Benutzers abfragen
    const projects = await ProjectModel.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    
    // Rückmeldung formatieren mit signierten URLs
    const formattedProjects = await Promise.all(projects.map(async project => {
      try {
        let signedUrl = undefined;
        
        // Generiere eine signierte URL für fertige Videos
        if (project.status === 'completed' && project.outputUrl) {
          signedUrl = await getSignedVideoUrlFromS3(project.outputUrl);
        }
        
        return {
          id: project._id.toString(),
          title: project.title,
          status: project.status,
          outputUrl: project.outputUrl,
          signedUrl,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        };
      } catch (error) {
        console.error(`Error processing project ${project._id}:`, error);
        return null;
      }
    }));
    
    // Filtere fehlgeschlagene Projekte heraus
    const validProjects = formattedProjects.filter(project => project !== null);
    
    // Erfolg zurückgeben
    return NextResponse.json({
      success: true,
      count: validProjects.length,
      projects: validProjects
    });
  } catch (error) {
    console.error('Error fetching projects from database:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch projects', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 