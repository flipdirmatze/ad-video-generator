import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';
import { analyzeScript, findBestMatchesForScript, ScriptSegment } from '@/lib/openai';
import { TaggedVideo, VideoMatch } from '@/utils/tag-matcher';
import { v4 as uuidv4 } from 'uuid';

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

    const { script } = await request.json();
    if (!script) {
      return NextResponse.json({ error: 'Script is required' }, { status: 400 });
    }

    console.log(`Starte kontextuelles Matching für Benutzer: ${session.user.id}`);

    await dbConnect();

    const userVideos = await VideoModel.find({
      userId: session.user.id,
      tags: { $exists: true, $not: { $size: 0 } }
    }).lean();

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
    
    const segments = await analyzeScript(script);
    if (!segments || segments.length === 0) {
      throw new Error('Script analysis failed to produce segments.');
    }
    
    const segmentsWithIds: ScriptSegment[] = segments.map(segment => ({
      ...segment,
      id: `seg_${uuidv4()}`,
    }));
    
    const scriptWithSegmentIds = segmentsWithIds
      .map(s => `Segment (ID: ${s.id}): ${s.text}`)
      .join('\n');

    const aiMatches = await findBestMatchesForScript(scriptWithSegmentIds, taggedVideos);

    const finalMatches: VideoMatch[] = aiMatches
      .map((aiMatch: AiMatch) => {
        const segment = segmentsWithIds.find(s => s.id === aiMatch.segmentId);
        const video = taggedVideos.find(v => v.id === aiMatch.videoId);

        if (!segment || !video) {
          return null;
        }

        const newMatch: VideoMatch = {
          segment,
          video,
          score: 1,
          source: 'auto',
        };
        return newMatch;
      })
      .filter((match): match is VideoMatch => match !== null);
    
    console.log(`Kontextuelles Matching abgeschlossen. ${finalMatches.length} Matches gefunden.`);
    
    return NextResponse.json({
      success: true,
      segments: segmentsWithIds,
      matches: finalMatches,
      totalVideos: taggedVideos.length
    });

  } catch (error) {
    console.error('Fehler im kontextuellen Video-Matching Prozess:', error);
    return NextResponse.json(
      { 
        error: 'Failed to match videos with new strategy', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 