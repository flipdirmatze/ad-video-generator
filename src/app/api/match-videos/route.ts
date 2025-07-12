import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';
import Voiceover, { IWordTimestamp } from '@/models/Voiceover';
import { generateVisualsForSegments, findBestMatchesForScript, ScriptSegment } from '@/lib/openai';
import { createSegmentsFromTimestamps } from '@/utils/segment-generator';
import { TaggedVideo, VideoMatch } from '@/utils/tag-matcher';

type AiMatch = {
  segmentId: string;
  videoId: string;
}

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

    console.log(`Starte präzises Matching für Voiceover: ${voiceoverId}`);

    await dbConnect();
    
    // 1. Voiceover mit Timestamps laden
    const voiceover = await Voiceover.findById(voiceoverId).lean<{ wordTimestamps?: IWordTimestamp[] }>();
    if (!voiceover || !voiceover.wordTimestamps || voiceover.wordTimestamps.length === 0) {
      throw new Error('Voiceover not found or does not contain timestamps.');
    }

    // 2. Präzise Segmente aus Timestamps erstellen
    const segments = createSegmentsFromTimestamps(voiceover.wordTimestamps);
    if (segments.length === 0) {
      throw new Error('Could not generate segments from timestamps.');
    }
    console.log(`${segments.length} präzise Segmente erstellt.`);

    // 3. Visuelle Beschreibungen für Segmente generieren
    const segmentsWithVisuals = await generateVisualsForSegments(segments);
    console.log('Visuelle Beschreibungen für Segmente erhalten.');

    // 4. Verfügbare Videos des Nutzers laden
    const userVideos = await VideoModel.find({ userId: session.user.id, tags: { $exists: true, $not: { $size: 0 } } }).lean();
    if (userVideos.length === 0) {
      return NextResponse.json({ error: 'No tagged videos found for user' }, { status: 404 });
    }
    const taggedVideos: TaggedVideo[] = userVideos.map(video => ({
      id: video.id,
      name: video.name,
      tags: video.tags || [],
      url: video.url || `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${video.path}`,
      path: video.path,
      duration: video.duration,
    }));

    // 5. Basierend auf visuellen Beschreibungen die besten Videos matchen
    // Wir übergeben der KI die Segmente mit den visuellen Ideen (gespeichert im 'keywords' Feld)
    const scriptWithVisuals = segmentsWithVisuals
      .map(s => `Segment (ID: ${s.id}, Dauer: ${s.duration}s, Text: "${s.text}")\nVisuelle Idee: ${s.keywords.join(' ')}`)
      .join('\n\n');

    const aiMatches: AiMatch[] = await findBestMatchesForScript(scriptWithVisuals, taggedVideos);

    // 6. Die rohen KI-Matches mit den vollständigen Daten anreichern
    const finalMatches: VideoMatch[] = aiMatches.map((aiMatch: AiMatch) => {
      const segment = segmentsWithVisuals.find(s => s.id === aiMatch.segmentId);
      const video = taggedVideos.find(v => v.id === aiMatch.videoId);

      if (!segment || !video) return null;

      const newMatch: VideoMatch = {
        segment,
        video,
        score: 1, // Score ist 1, da KI-basiert
        source: 'auto',
      };
      return newMatch;
    }).filter((match): match is VideoMatch => match !== null);

    console.log(`Präzises Matching abgeschlossen. ${finalMatches.length} Matches gefunden.`);

    return NextResponse.json({
      success: true,
      segments: segmentsWithVisuals,
      matches: finalMatches,
      totalVideos: taggedVideos.length,
    });

  } catch (error) {
    console.error('Fehler im präzisen Video-Matching Prozess:', error);
    return NextResponse.json(
      { 
        error: 'Failed to match videos with new precise strategy', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 