import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';
import { getSignedVideoUrl, getSignedDownloadUrl } from '@/lib/storage';

/**
 * GET /api/media
 * Gibt alle verfügbaren Videos des aktuell eingeloggten Benutzers zurück
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
    
    // Videos des Benutzers abfragen
    const videos = await VideoModel.find({ userId })
      .sort({ createdAt: -1 })
      .lean();
    
    // Rückmeldung formatieren mit signierten URLs
    const files = await Promise.all(videos.map(async (video) => {
      // Generiere eine signierte URL für jedes Video
      let signedUrl;
      try {
        if (video.path) {
          signedUrl = await getSignedDownloadUrl(video.path, 86400); // 24 Stunden gültige URL
          console.log(`Generated signed URL for video ${video.id}`);
        } else {
          signedUrl = video.url;
          console.log(`No path for video ${video.id}, using original URL`);
        }
      } catch (error) {
        console.error(`Failed to generate signed URL for video ${video.id}:`, error);
        signedUrl = video.url; // Fallback zur ursprünglichen URL
      }

      return {
        id: video.id,
        name: video.name,
        size: video.size,
        type: video.type,
        url: signedUrl, // Verwende die signierte URL
        path: video.path, // Behalte den Pfad für spätere Verwendung
        tags: video.tags || [],
        createdAt: video.createdAt,
        isPublic: video.isPublic,
        status: video.status || 'complete',
        progress: video.progress || 100
      };
    }));
    
    // Filtere fehlgeschlagene Videos heraus
    const validFiles = files.filter(file => file !== null);
    
    // Erfolg zurückgeben
    return NextResponse.json({
      success: true,
      count: validFiles.length,
      files: validFiles
    });
  } catch (error) {
    console.error('Error fetching videos from database:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch videos', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/media
 * Aktualisiert die Metadaten eines Videos in der Datenbank
 */
export async function POST(request: NextRequest) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const data = await request.json();
    const { videoId, ...updateData } = data;
    
    if (!videoId) {
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }
    
    // Verbindung zur Datenbank herstellen
    await dbConnect();
    
    // Video finden und prüfen, ob es dem Benutzer gehört
    const video = await VideoModel.findOne({ 
      id: videoId,
      userId 
    });
    
    if (!video) {
      return NextResponse.json({ error: 'Video not found or no permission' }, { status: 404 });
    }
    
    // Erlaubte Felder definieren, die aktualisiert werden dürfen
    const allowedFields = ['name', 'tags', 'isPublic'];
    
    // Nur erlaubte Felder aktualisieren
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        video[key] = updateData[key];
      }
    });
    
    // Aktualisierungsdatum setzen
    video.updatedAt = new Date();
    
    // Speichern
    await video.save();
    
    return NextResponse.json({
      success: true,
      message: 'Video updated successfully',
      video: {
        id: video.id,
        _id: video._id.toString(),
        name: video.name,
        tags: video.tags,
        isPublic: video.isPublic,
        updatedAt: video.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating video:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update video', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 