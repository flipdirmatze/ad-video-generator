import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';
import Voiceover, { IWordTimestamp } from '@/models/Voiceover';
import { createVisualPlaylistForScript, ScriptSegment } from '@/lib/openai';
import { createSegmentsFromTimestamps } from '@/utils/segment-generator';
import { TaggedVideo, VideoMatch } from '@/utils/tag-matcher';

type Playlist = {
  segmentId: string;
  videoIds: string[];
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

    console.log(`Starte optimiertes Playlist-Matching für Voiceover: ${voiceoverId}`);

    await dbConnect();
    
    const voiceover = await Voiceover.findById(voiceoverId).lean<{ wordTimestamps?: IWordTimestamp[] }>();
    if (!voiceover || !voiceover.wordTimestamps || voiceover.wordTimestamps.length === 0) {
      throw new Error('Voiceover not found or does not contain timestamps.');
    }

    const segments = createSegmentsFromTimestamps(voiceover.wordTimestamps);
    if (segments.length === 0) {
      throw new Error('Could not generate segments from timestamps.');
    }

    const userVideos = await VideoModel.find({ userId: session.user.id }).lean();
    if (userVideos.length === 0) {
      return NextResponse.json({ error: 'No videos found for user' }, { status: 404 });
    }
    const taggedVideos = userVideos.map(video => ({
      id: video.id,
      name: video.name,
      tags: video.tags || [],
    }));

    const playlist: Playlist[] = await createVisualPlaylistForScript(segments, taggedVideos);

    const scenes = playlist.map(item => {
      const segment = segments.find(s => s.id === item.segmentId);
      if (!segment) return null;

      const clipCount = item.videoIds.length;
      if (clipCount === 0) return null;

      const durationPerClip = parseFloat((segment.duration / clipCount).toFixed(2));

      return {
        segmentId: item.segmentId,
        videoClips: item.videoIds.map(videoId => ({
          videoId,
          duration: durationPerClip,
        })),
      };
    }).filter(Boolean);

    console.log(`Optimiertes Matching abgeschlossen. ${scenes.length} Szenen erstellt.`);

    return NextResponse.json({
      success: true,
      segments: segments,
      scenes: scenes,
      totalVideos: taggedVideos.length,
    });

  } catch (error) {
    console.error('Fehler im Playlist-Matching Prozess:', error);
    return NextResponse.json(
      { 
        error: 'Failed to match videos with playlist strategy', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 