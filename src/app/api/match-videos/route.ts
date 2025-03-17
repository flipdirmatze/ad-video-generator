import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';
import { analyzeScript } from '@/lib/openai';
import { matchVideosToSegments, TaggedVideo } from '@/utils/tag-matcher';

export async function POST(request: NextRequest) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Daten aus dem Request-Body extrahieren
    const { script } = await request.json();
    
    if (!script) {
      return NextResponse.json({ error: 'Script is required' }, { status: 400 });
    }

    console.log(`Matching Videos für Skript, Benutzer: ${session.user.id}...`);

    // Skript analysieren
    const segments = await analyzeScript(script);
    
    console.log(`Skriptanalyse abgeschlossen. ${segments.length} Segmente gefunden.`);

    // Mit Datenbank verbinden
    await dbConnect();
    
    // Videos des Benutzers abrufen
    const videos = await VideoModel.find({ 
      userId: session.user.id,
      // Nur Videos mit Tags berücksichtigen
      tags: { $exists: true, $not: { $size: 0 } }
    }).lean();
    
    console.log(`${videos.length} Videos mit Tags gefunden.`);
    
    // Videos zum Skript matchen
    const taggedVideos: TaggedVideo[] = videos.map(video => ({
      id: video.id,
      name: video.name,
      tags: video.tags || [],
      url: video.url || `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${video.path}`,
      path: video.path,
      duration: video.duration
    }));
    
    const matches = matchVideosToSegments(segments, taggedVideos);
    
    console.log(`Matching abgeschlossen. ${matches.length} Matches gefunden.`);
    
    return NextResponse.json({
      success: true,
      segments,
      matches,
      totalVideos: videos.length
    });
  } catch (error) {
    console.error('Error matching videos to script:', error);
    return NextResponse.json(
      { 
        error: 'Failed to match videos', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 