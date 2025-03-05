import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { awsConfig } from '@/utils/aws-config';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { 
  VideoSegment, 
  getTempDir, 
  downloadFile, 
  combineVideosWithVoiceover, 
  cleanupTempFiles 
} from '@/utils/ffmpeg-utils';

// Initialize S3 client
const s3Client = new S3Client({
  region: awsConfig.region,
  credentials: {
    accessKeyId: awsConfig.accessKeyId!,
    secretAccessKey: awsConfig.secretAccessKey!,
  },
});

type VideoRequestSegment = {
  videoId: string;
  startTime: number;
  duration: number;
  position: number;
}

type VideoRequest = {
  voiceoverUrl: string;
  segments: VideoRequestSegment[];
  videos: Array<{
    id: string;
    url: string;
  }>;
}

export async function POST(request: Request) {
  try {
    // Check if AWS is configured
    if (!awsConfig.accessKeyId || !awsConfig.secretAccessKey || !awsConfig.bucketName) {
      return NextResponse.json(
        { error: 'AWS credentials not configured' },
        { status: 500 }
      );
    }

    // Get request body
    const data: VideoRequest = await request.json();
    
    if (!data.voiceoverUrl || !data.segments || !data.videos || data.segments.length === 0 || data.videos.length === 0) {
      return NextResponse.json({ error: 'Missing required data' }, { status: 400 });
    }

    // Create a temporary directory for processing
    const tempDir = await getTempDir();
    const tempFiles: string[] = [];
    
    try {
      // Download voiceover
      const voiceoverPath = path.join(tempDir, 'voiceover.mp3');
      await downloadFile(data.voiceoverUrl, voiceoverPath);
      tempFiles.push(voiceoverPath);
      
      // Prepare video segments
      const videoSegments: VideoSegment[] = [];
      
      // Download videos and create segments
      for (const segment of data.segments) {
        const video = data.videos.find(v => v.id === segment.videoId);
        if (!video) continue;
        
        const videoFileName = `video-${segment.videoId}.mp4`;
        const videoPath = path.join(tempDir, videoFileName);
        
        // Download video
        await downloadFile(video.url, videoPath);
        tempFiles.push(videoPath);
        
        // Add to segments
        videoSegments.push({
          videoId: segment.videoId,
          url: videoPath,
          startTime: segment.startTime,
          duration: segment.duration,
          position: segment.position
        });
      }
      
      // Sort segments by position
      videoSegments.sort((a, b) => a.position - b.position);
      
      // Generate output path
      const uniqueFileName = `final-${Date.now()}-${uuidv4()}.mp4`;
      const outputPath = path.join(tempDir, uniqueFileName);
      
      // Combine videos with voiceover
      await combineVideosWithVoiceover(voiceoverPath, videoSegments, outputPath);
      tempFiles.push(outputPath);
      
      // Read the output file
      const outputBuffer = await fs.readFile(outputPath);
      
      // Upload to S3
      const uploadParams = {
        Bucket: awsConfig.bucketName,
        Key: `final/${uniqueFileName}`,
        Body: outputBuffer,
        ContentType: 'video/mp4',
      };
      
      await s3Client.send(new PutObjectCommand(uploadParams));
      
      // Return success with the S3 URL
      return NextResponse.json({
        success: true,
        videoUrl: `https://${awsConfig.bucketName}.s3.${awsConfig.region}.amazonaws.com/final/${uniqueFileName}`,
        message: 'Video generated successfully',
      });
    } catch (error) {
      console.error('Error processing video:', error);
      throw error;
    } finally {
      // Clean up temporary files
      await cleanupTempFiles(tempFiles, [tempDir]);
    }
  } catch (error) {
    console.error('Error generating final video:', error);
    return NextResponse.json(
      { error: 'Failed to generate video' },
      { status: 500 }
    );
  }
} 