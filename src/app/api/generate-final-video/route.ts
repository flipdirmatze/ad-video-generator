import { NextResponse } from 'next/server';
import { combineVideosWithVoiceover, VideoSegment, VideoInfo } from '@/utils/ffmpeg-utils';

type VideoRequest = {
  voiceoverUrl: string;
  segments: VideoSegment[];
  videos: VideoInfo[];
};

export async function POST(request: Request) {
  try {
    // Prüfen der API-Schlüssel und Berechtigungen (optional)
    // const apiKey = request.headers.get('x-api-key');
    // if (!apiKey || apiKey !== process.env.API_KEY) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    // Daten aus der Anfrage extrahieren
    const data: VideoRequest = await request.json();
    
    if (!data.voiceoverUrl || !data.segments || !data.videos || data.segments.length === 0 || data.videos.length === 0) {
      return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
    }

    console.log('Starting video generation process...');
    console.log(`Voiceover URL: ${data.voiceoverUrl}`);
    console.log(`Number of segments: ${data.segments.length}`);
    console.log(`Number of videos: ${data.videos.length}`);

    // Verwende FFmpeg, um die Videos zu kombinieren und das Voiceover hinzuzufügen
    const videoUrl = await combineVideosWithVoiceover(
      data.voiceoverUrl,
      data.segments,
      data.videos
    );

    console.log('Video generation completed successfully');
    console.log(`Generated video URL: ${videoUrl}`);

    return NextResponse.json({
      success: true,
      message: 'Video successfully generated',
      videoUrl,
      segments: data.segments,
    });
    
  } catch (error) {
    console.error('Error generating final video:', error);
    return NextResponse.json(
      { error: 'Failed to generate video', details: (error as Error).message },
      { status: 500 }
    );
  }
} 