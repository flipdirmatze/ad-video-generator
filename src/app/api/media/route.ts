import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';
import { getS3UrlSigned } from '@/lib/storage';

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
    
    // Für jedes Video eine signierte URL generieren
    const videosWithSignedUrls = await Promise.all(videos.map(async (video) => {
      try {
        // Verwende die getS3UrlSigned-Funktion, um eine signierte URL zu erhalten
        const signedUrl = await getS3UrlSigned(video.path);
        
        console.log(`Generated signed URL for video ${video.id}. Path: ${video.path}`);
        console.log(`URL starts with: ${signedUrl.substring(0, 100)}...`);
        
        return {
          ...video,
          url: signedUrl, // Ersetze die ursprüngliche URL mit der signierten URL
          key: video.path, // Stelle sicher, dass der Key für spätere Verwendung verfügbar ist
        };
      } catch (error) {
        console.error(`Error generating signed URL for video ${video.id}:`, error);
        // Wenn die signierte URL-Generierung fehlschlägt, verwende die ursprüngliche URL
        return video;
      }
    }));
    
    // Filtere fehlgeschlagene Videos heraus
    const validVideos = videosWithSignedUrls.filter(video => video !== null);
    
    // Erfolg zurückgeben
    return NextResponse.json({
      success: true,
      count: validVideos.length,
      files: validVideos
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