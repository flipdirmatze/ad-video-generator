import { NextResponse } from 'next/server';
import fs from 'fs-extra';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';

interface FileInfo {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: Date;
  // ID is extracted from the filename if possible (everything before the first dash or dot)
  id: string;
}

// Extraktion der Videodateierkennung in eine Hilfsfunktion
const isVideoFile = (ext: string): boolean => {
  return ['.mp4', '.mov', '.webm', '.avi', '.wmv', '.mkv'].includes(ext.toLowerCase());
};

const getFileId = (filename: string): string => {
  let id = filename.split('.')[0]; // Default to everything before first dot
  if (id.includes('-')) {
    id = id.split('-')[0]; // Take only the part before the first dash
  }
  return id;
};

export async function GET() {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Path to the uploads directory
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    
    // Check if directory exists
    if (!fs.existsSync(uploadsDir)) {
      await fs.mkdir(uploadsDir, { recursive: true });
      console.log(`Created uploads directory: ${uploadsDir}`);
      
      return NextResponse.json({
        files: [],
        message: 'Uploads directory created'
      });
    }
    
    // Read the directory content
    const files = await fs.readdir(uploadsDir);
    
    // Filter for video files only and gather more information
    const videoFiles: FileInfo[] = [];
    
    for (const file of files) {
      const ext = path.extname(file);
      if (isVideoFile(ext)) {
        const filePath = path.join(uploadsDir, file);
        const stats = await fs.stat(filePath);
        
        videoFiles.push({
          name: file,
          path: `/uploads/${file}`,
          size: stats.size,
          type: `video/${ext.slice(1)}`, // Remove the dot from extension
          lastModified: stats.mtime,
          id: getFileId(file)
        });
      }
    }
    
    // Sort by last modified date, newest first
    videoFiles.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    // Verbindung zur Datenbank herstellen
    await dbConnect();
    
    // Videos aus der Datenbank abrufen
    const dbVideos = await VideoModel.find({ 
      userId: session.user.id 
    }).lean();
    
    // Dateibasierte Videos und Datenbankeinträge kombinieren
    const combinedFiles = [...videoFiles];
    
    // Videos aus der Datenbank hinzufügen, die nicht als Datei gefunden wurden
    for (const dbVideo of dbVideos) {
      // Prüfe, ob das Video bereits im Ergebnis-Array vorhanden ist
      const existingVideoIndex = combinedFiles.findIndex(
        file => 
          file.id === dbVideo.id || 
          file.path === dbVideo.path ||
          file.path === `/uploads/${dbVideo.id}.mp4`
      );
      
      if (existingVideoIndex >= 0) {
        // Video bereits vorhanden, ID aus Datenbank ergänzen
        combinedFiles[existingVideoIndex].id = dbVideo.id;
      } else {
        // Video nicht vorhanden, aus Datenbank hinzufügen
        combinedFiles.push({
          id: dbVideo.id,
          name: dbVideo.name,
          path: dbVideo.path,
          size: dbVideo.size,
          type: dbVideo.type,
          lastModified: dbVideo.updatedAt || dbVideo.createdAt,
        });
      }
    }
    
    return NextResponse.json({
      files: combinedFiles,
      count: combinedFiles.length,
      dbCount: dbVideos.length,
      fsCount: videoFiles.length
    });
  } catch (error) {
    console.error('Error listing uploads:', error);
    return NextResponse.json(
      { 
        error: 'Failed to list uploads', 
        details: error instanceof Error ? error.message : String(error),
        path: path.join(process.cwd(), 'public', 'uploads')
      },
      { status: 500 }
    );
  }
} 