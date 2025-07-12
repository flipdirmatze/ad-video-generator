import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';
import Voiceover, { IWordTimestamp } from '@/models/Voiceover';
import { createScenesForScript, ScriptSegment } from '@/lib/openai';
import { createSegmentsFromTimestamps } from '@/utils/segment-generator';
import { TaggedVideo, VideoMatch } from '@/utils/tag-matcher';

type Scene = {
  segmentId: string;
  videoClips: { videoId: string; duration: number }[];
};

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { voiceoverId } = await request.json();
    if (!voiceoverId) {
      return NextResponse.json({ error: 'voiceoverId is required' }, { status: 400 });
    }

    console.log(`Starte Szenen-basiertes Matching für Voiceover: ${voiceoverId}`);

    await dbConnect();
    
    const voiceover = await Voiceover.findById(voiceoverId).lean<{ wordTimestamps?: IWordTimestamp[] }>();
    if (!voiceover || !voiceover.wordTimestamps || voiceover.wordTimestamps.length === 0) {
      throw new Error('Voiceover not found or does not contain timestamps.');
    }

    const segments = createSegmentsFromTimestamps(voiceover.wordTimestamps);
    if (segments.length === 0) {
      throw new Error('Could not generate segments from timestamps.');
    }

    const userVideos = await VideoModel.find({ userId: session.user.id, tags: { $exists: true, $not: { $size: 0 } } }).lean();
    if (userVideos.length === 0) {
      return NextResponse.json({ error: 'No tagged videos found for user' }, { status: 404 });
    }
    const taggedVideos = userVideos.map(video => ({
      id: video.id,
      name: video.name,
      tags: video.tags || [],
      duration: video.duration || 0, // Wichtig: Dauer übergeben
    }));

    // Neue KI-Funktion aufrufen, um Szenen zu erstellen
    const scenes: Scene[] = await createScenesForScript(segments, taggedVideos);

    // Die Szenen in das `VideoMatch` Format umwandeln, das das Frontend erwartet.
    // HINWEIS: Dieser Teil muss im Frontend angepasst werden, um mehrere Clips pro Segment zu visualisieren.
    // Vorerst nehmen wir nur den ersten Clip pro Szene für die Kompatibilität.
    const finalMatches: VideoMatch[] = scenes.map((scene: Scene) => {
      const segment = segments.find(s => s.id === scene.segmentId);
      const firstClip = scene.videoClips[0];
      if (!segment || !firstClip) return null;

      const video = taggedVideos.find(v => v.id === firstClip.videoId);
      if (!video) return null;

      const fullVideoData: TaggedVideo = {
        ...video,
        url: `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${(userVideos.find(v=>v.id === video.id) as any)?.path}`,
        path: (userVideos.find(v=>v.id === video.id) as any)?.path,
      }

      const newMatch: VideoMatch = {
        segment,
        video: fullVideoData,
        score: 1,
        source: 'auto',
      };
      return newMatch;
    }).filter((match): match is VideoMatch => match !== null);

    console.log(`Szenen-basiertes Matching abgeschlossen. ${finalMatches.length} Matches gefunden.`);

    return NextResponse.json({
      success: true,
      segments: segments,
      matches: finalMatches, // Vorerst nur der erste Clip pro Szene
      scenes: scenes, // Die volle Szenen-Struktur für zukünftige Frontend-Anpassungen
      totalVideos: taggedVideos.length,
    });

  } catch (error) {
    console.error('Fehler im szenen-basierten Video-Matching:', error);
    return NextResponse.json(
      { 
        error: 'Failed to match videos with scene-based strategy', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 