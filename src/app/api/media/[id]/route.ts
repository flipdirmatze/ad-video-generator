import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel, { IVideo } from '@/models/Video';
import mongoose from 'mongoose';
import { getSignedVideoUrl } from '@/lib/storage';

// Erweitere den IVideo-Typ für das Dokument aus MongoDB
interface IVideoDocument extends IVideo {
  _id?: mongoose.Types.ObjectId;
}

/**
 * GET /api/media/[id]
 * Gibt ein einzelnes Video zurück
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
    const { id: videoId } = await params;
    
    // Verbindung zur Datenbank herstellen
    await dbConnect();
    
    // Video des Benutzers abfragen
    const video = await VideoModel.findOne({ 
      id: videoId,
      userId 
    }).lean() as unknown as IVideoDocument;
    
    if (!video) {
      return NextResponse.json({ error: 'Video not found or no permission' }, { status: 404 });
    }
    
    // Generiere eine frische signierte URL für das Video
    let signedUrl = '';
    try {
      if (video.path) {
        signedUrl = await getSignedVideoUrl(video.path, 3600); // 1 Stunde gültig
        console.log(`Generated fresh signed URL for video ${video.id}`);
      } else {
        console.warn(`No path found for video ${video.id}, can't generate signed URL`);
      }
    } catch (error) {
      console.error(`Error generating signed URL for video ${video.id}:`, error);
    }
    
    // Rückmeldung formatieren
    const formattedVideo = {
      id: video.id,
      _id: video._id ? video._id.toString() : undefined,
      name: video.name,
      path: video.path || video.url, // Fallback falls path nicht existiert
      url: signedUrl || video.url, // Verwende die neue signierte URL oder die bestehende
      size: video.size,
      type: video.type,
      tags: video.tags || [],
      createdAt: video.createdAt,
      isPublic: video.isPublic || false
    };
    
    // Erfolg zurückgeben
    return NextResponse.json({
      success: true,
      video: formattedVideo
    });
  } catch (error) {
    console.error('Error fetching video from database:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch video', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/media/[id]
 * Löscht ein Video aus der Datenbank
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
    const { id: videoId } = await params;
    
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
    
    // Video löschen
    await VideoModel.deleteOne({ id: videoId, userId });
    
    // Hier könnte man noch das Video aus S3 löschen, falls erforderlich
    // Dies würde einen zusätzlichen AWS S3 DeleteObject-Aufruf erfordern
    
    return NextResponse.json({
      success: true,
      message: 'Video deleted successfully',
      videoId
    });
  } catch (error) {
    console.error('Error deleting video:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete video', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}