import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { concatVideosWithoutReencoding } from '@/utils/ffmpeg-utils';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { videos } = body;

    // Validate input
    if (!videos || !Array.isArray(videos) || videos.length < 2) {
      return NextResponse.json(
        { error: 'At least two videos are required for concatenation' },
        { status: 400 }
      );
    }

    // Resolve absolute paths for videos
    const inputVideos = videos.map(video => {
      // Get path from request - this should be a relative path from public folder
      const videoPath = video.path;
      
      if (!videoPath) {
        throw new Error('Video path is required for each video');
      }
      
      // Convert to absolute path
      const publicDir = path.join(process.cwd(), 'public');
      return path.join(publicDir, videoPath.startsWith('/') ? videoPath.slice(1) : videoPath);
    });

    // Validate that all video files exist
    for (const videoPath of inputVideos) {
      if (!fs.existsSync(videoPath)) {
        return NextResponse.json(
          { error: `Video file does not exist: ${videoPath}` },
          { status: 400 }
        );
      }
    }

    // Generate output path
    const outputFileName = `concat-${uuidv4()}.mp4`;
    const outputDir = path.join(process.cwd(), 'public', 'outputs');
    
    // Make sure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = path.join(outputDir, outputFileName);
    
    // Perform video concatenation without re-encoding
    await concatVideosWithoutReencoding(inputVideos, outputPath);
    
    // Return the relative path to the concatenated video
    return NextResponse.json({ 
      outputPath: `/outputs/${outputFileName}`,
      message: 'Videos concatenated successfully'
    });
  } catch (error) {
    console.error('Error concatenating videos:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to concatenate videos' },
      { status: 500 }
    );
  }
} 