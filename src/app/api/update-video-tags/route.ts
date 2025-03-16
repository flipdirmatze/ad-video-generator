import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';

export async function POST(request: Request) {
  try {
    // Sichere Authentifizierung
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Hole Daten aus dem Request
    const data = await request.json();
    const { videoId, tags } = data;

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
    }

    if (!Array.isArray(tags)) {
      return NextResponse.json({ error: 'Tags must be an array' }, { status: 400 });
    }

    // Mit Datenbank verbinden
    await dbConnect();

    // Finde das Video und stelle sicher, dass es dem aktuellen Benutzer gehört
    const video = await VideoModel.findOne({
      id: videoId,
      userId: session.user.id
    });

    if (!video) {
      return NextResponse.json({ error: 'Video not found or no permission' }, { status: 404 });
    }

    // Update die Tags
    video.tags = tags;
    video.updatedAt = new Date();
    await video.save();

    return NextResponse.json({
      success: true,
      videoId,
      tags
    });
  } catch (error) {
    console.error('Error updating tags:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update tags', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 