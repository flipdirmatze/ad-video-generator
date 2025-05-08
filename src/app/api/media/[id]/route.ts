import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel, { IVideo } from '@/models/Video';
import mongoose from 'mongoose';
import { getSignedVideoUrl, deleteS3Object } from '@/lib/storage';

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
 * Löscht ein Video aus S3 und der Datenbank
 */
export async function DELETE(
  request: NextRequest,
  context: { params: { id: string } } // Korrigierte Signatur
) {
  try {
    const videoId = context.params.id; // Extrahiere ID aus context.params
    if (!videoId) {
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    console.log(`[API DELETE /api/media/${videoId}] Request received`);

    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.error(`[API DELETE /api/media/${videoId}] Unauthorized: No session`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    console.log(`[API DELETE /api/media/${videoId}] User authenticated: ${userId}`);

    // Mit Datenbank verbinden
    await dbConnect();

    // Video finden und prüfen, ob es dem Benutzer gehört
    console.log(`[API DELETE /api/media/${videoId}] Finding video...`);
    // Wichtig: Verwende lean() nicht, wenn du später deleteOne auf dem Objekt aufrufen willst
    // Holen wir das volle Dokument, um sicherzustellen, dass der Pfad korrekt ist.
    const video = await VideoModel.findOne({
      id: videoId,
      userId: userId 
    }) as IVideoDocument | null; // lean() entfernt

    if (!video) {
      console.error(`[API DELETE /api/media/${videoId}] Video not found or user mismatch.`);
      return NextResponse.json({ error: 'Video not found or user mismatch' }, { status: 404 });
    }
    console.log(`[API DELETE /api/media/${videoId}] Found video: ${video.name}, Path: ${video.path}`);

    // 1. Objekt aus S3 löschen
    let s3DeleteSuccess = false;
    if (video.path) {
      s3DeleteSuccess = await deleteS3Object(video.path);
      if (!s3DeleteSuccess) {
        // Logge den Fehler, aber fahre fort, um den DB-Eintrag zu löschen
        console.warn(`[API DELETE /api/media/${videoId}] Failed to delete S3 object, but proceeding with DB deletion.`);
      }
    } else {
      console.warn(`[API DELETE /api/media/${videoId}] Video has no path, skipping S3 deletion.`);
      // Wenn kein Pfad da ist, betrachten wir die S3-Löschung als "erfolgreich"
      s3DeleteSuccess = true;
    }

    // 2. Dokument aus MongoDB löschen (verwende deleteOne mit Filter)
    console.log(`[API DELETE /api/media/${videoId}] Deleting video document from DB...`);
    const dbDeleteResult = await VideoModel.deleteOne({ id: videoId, userId: userId });

    if (dbDeleteResult.deletedCount === 0) {
      console.error(`[API DELETE /api/media/${videoId}] Failed to delete video from DB, although it was found earlier.`);
      return NextResponse.json({ error: 'Failed to delete video from database' }, { status: 500 });
    }
    
    console.log(`[API DELETE /api/media/${videoId}] Successfully deleted video document from DB.`);

    return NextResponse.json({
      success: true,
      message: 'Video deleted successfully',
      s3Deleted: s3DeleteSuccess
    });

  } catch (error) {
    console.error(`[API DELETE /api/media/[id]] Error:`, error);
    return NextResponse.json(
      { 
        error: 'Failed to delete video', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}