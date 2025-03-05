import { createReadStream } from 'fs';
import { Readable } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Define types
export type VideoSegment = {
  videoId: string;
  url: string;
  startTime: number;
  duration: number;
  position: number;
};

export type VideoInfo = {
  width: number;
  height: number;
  duration: number;
  fps?: number;
};

// Create a temporary directory for processing
export const getTempDir = async (): Promise<string> => {
  const tempDir = path.join(os.tmpdir(), 'ai-ad-generator', uuidv4());
  await fs.ensureDir(tempDir);
  return tempDir;
};

// Download a file from URL to local path
export const downloadFile = async (url: string, outputPath: string): Promise<string> => {
  // If the URL is a local file path (starts with /), just copy it
  if (url.startsWith('/') || url.startsWith('file://')) {
    const sourcePath = url.replace('file://', '');
    await fs.copy(sourcePath, outputPath);
    return outputPath;
  }

  // Otherwise, download from remote URL
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file from ${url}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));
  return outputPath;
};

// Get video information using ffmpeg
export const getVideoInfo = async (videoPath: string): Promise<VideoInfo> => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      if (!videoStream) {
        reject(new Error('No video stream found'));
        return;
      }

      // Calculate FPS
      let fps;
      if (videoStream.r_frame_rate) {
        const [numerator, denominator] = videoStream.r_frame_rate.split('/').map(Number);
        fps = numerator / denominator;
      }

      resolve({
        width: videoStream.width || 1920,
        height: videoStream.height || 1080,
        duration: metadata.format.duration ? Number(metadata.format.duration) : 0,
        fps
      });
    });
  });
};

// Combine videos with voiceover
export const combineVideosWithVoiceover = async (
  voiceoverPath: string,
  videoSegments: VideoSegment[],
  outputPath: string,
  progressCallback?: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Create a command
    let command = ffmpeg();

    // Add voiceover input
    command.input(voiceoverPath);

    // Add video inputs
    videoSegments.forEach(segment => {
      command.input(segment.url);
    });

    // Create filter complex string
    let filterComplex: string[] = [];
    let videoInputs: string[] = [];

    // Process each video segment
    videoSegments.forEach((segment, index) => {
      // Scale video to 1920x1080 while maintaining aspect ratio
      filterComplex.push(`[${index + 1}:v]trim=${segment.startTime}:${segment.startTime + segment.duration},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v${index}]`);
      videoInputs.push(`[v${index}]`);
    });

    // Concatenate all video segments
    filterComplex.push(`${videoInputs.join('')}concat=n=${videoSegments.length}:v=1:a=0[outv]`);

    // Process audio
    filterComplex.push(`[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[outa]`);

    // Apply filter complex
    command.complexFilter(filterComplex.join(';'), ['outv', 'outa']);

    // Set output options
    command
      .outputOptions([
        '-map', '[outv]',
        '-map', '[outa]',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest'
      ])
      .output(outputPath);

    // Add progress handler
    if (progressCallback) {
      command.on('progress', (progress) => {
        if (progress.percent) {
          progressCallback(Math.min(progress.percent, 100));
        }
      });
    }

    // Add event handlers
    command
      .on('end', () => {
        resolve(outputPath);
      })
      .on('error', (err) => {
        reject(err);
      });

    // Run the command
    command.run();
  });
};

// Clean up temporary files and directories
export const cleanupTempFiles = async (files: string[], directories: string[] = []): Promise<void> => {
  // Remove files
  for (const file of files) {
    try {
      await fs.remove(file);
    } catch (error) {
      console.error(`Failed to remove file ${file}:`, error);
    }
  }

  // Remove directories
  for (const dir of directories) {
    try {
      await fs.remove(dir);
    } catch (error) {
      console.error(`Failed to remove directory ${dir}:`, error);
    }
  }
}; 