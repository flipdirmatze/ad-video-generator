import { createReadStream } from 'fs';
import { Readable } from 'stream';
import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Lokaler FFmpeg-Pfad (falls vorhanden)
const localFFmpegPath = path.join(process.cwd(), 'ffmpeg-bin', 'ffmpeg');
const localFFprobePath = path.join(process.cwd(), 'ffmpeg-bin', 'ffprobe');

// Vereinfachte FFmpeg-Konfiguration
let ffmpegPath = 'ffmpeg'; // Standard-Befehlsname
let ffprobePath = 'ffprobe'; // Standard-Befehlsname für ffprobe

// Prüfe zuerst, ob die lokale FFmpeg-Installation existiert
if (fs.existsSync(localFFmpegPath)) {
  ffmpegPath = localFFmpegPath;
  console.log('Using local FFmpeg installation:', ffmpegPath);
  
  // Mache die Datei ausführbar (nur für Unix-Systeme)
  if (os.platform() !== 'win32') {
    try {
      fs.chmodSync(localFFmpegPath, '755');
      console.log('Made local FFmpeg executable');
    } catch (error) {
      console.error('Error making FFmpeg executable:', error);
    }
  }
} else {
  // Versuche, das FFmpeg-Paket zu laden
  try {
    // Versuche zuerst das plattformspezifische Paket
    try {
      // Für macOS ARM64 (M1/M2)
      if (os.platform() === 'darwin' && os.arch() === 'arm64') {
        const ffmpegInstaller = require('@ffmpeg-installer/darwin-arm64');
        ffmpegPath = ffmpegInstaller.path;
        console.log('Using macOS ARM64 FFmpeg from node_modules:', ffmpegPath);
      } else {
        // Verwende das generische Paket
        const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
        ffmpegPath = ffmpegInstaller.path;
        console.log('Using generic FFmpeg from node_modules:', ffmpegPath);
      }
    } catch (specificError) {
      console.error('Error loading platform-specific FFmpeg:', specificError);
      // Letzter Ausweg
      ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
      console.log('Fallback to generic FFmpeg');
    }
  } catch (error) {
    console.error('Error loading FFmpeg:', error);
    // Für den Fall, dass nichts anderes funktioniert, versuchen wir es mit dem systemweit installierten FFmpeg
    console.log('Falling back to system-installed FFmpeg');
  }
}

// Ähnliche Logik für FFprobe
// Prüfe, ob ein lokaler ffprobe vorhanden ist
if (fs.existsSync(localFFprobePath)) {
  ffprobePath = localFFprobePath;
  console.log('Using local FFprobe installation:', ffprobePath);
  
  // Mache die Datei ausführbar (nur für Unix-Systeme)
  if (os.platform() !== 'win32') {
    try {
      fs.chmodSync(localFFprobePath, '755');
      console.log('Made local FFprobe executable');
    } catch (error) {
      console.error('Error making FFprobe executable:', error);
    }
  }
} else {
  console.log('Local FFprobe not found, will try to find system FFprobe');
  
  // Wenn das ffmpeg-Paket aus den Node-Modulen geladen wurde, versuche den ffprobe daraus zu verwenden
  try {
    if (ffmpegPath.includes('node_modules')) {
      // Extrahiere den Pfad zum ffprobe basierend auf dem FFmpeg-Pfad
      const ffmpegDir = path.dirname(ffmpegPath);
      const possibleFfprobePath = path.join(ffmpegDir, 'ffprobe');
      
      if (fs.existsSync(possibleFfprobePath)) {
        ffprobePath = possibleFfprobePath;
        console.log('Found FFprobe in same directory as FFmpeg:', ffprobePath);
      } else {
        console.log('FFprobe not found in FFmpeg directory:', ffmpegDir);
      }
    }
  } catch (error) {
    console.error('Error finding FFprobe:', error);
  }
}

// Setze die FFmpeg-Konfiguration
console.log(`Setting FFmpeg path to: ${ffmpegPath}`);
console.log(`Setting FFprobe path to: ${ffprobePath}`);
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Teste, ob FFmpeg und FFprobe verfügbar sind
const testFFmpegAndFFprobe = async () => {
  try {
    const { stdout: ffmpegOutput } = await execAsync(`"${ffmpegPath}" -version`);
    console.log('FFmpeg version:', ffmpegOutput.split('\n')[0]);
  } catch (error) {
    console.error('Error testing FFmpeg:', error);
    console.warn('FFmpeg may not be properly installed or configured');
  }
  
  try {
    const { stdout: ffprobeOutput } = await execAsync(`"${ffprobePath}" -version`);
    console.log('FFprobe version:', ffprobeOutput.split('\n')[0]);
  } catch (error) {
    console.error('Error testing FFprobe:', error);
    console.warn('FFprobe may not be properly installed or configured. This will affect video analysis capabilities.');
  }
};

// Führe den Test aus
testFFmpegAndFFprobe().catch(err => console.error('Error testing FFmpeg tools:', err));

// Check if FFmpeg is available and get version
export const checkFFmpegAvailability = async (): Promise<{ available: boolean; version?: string; error?: string }> => {
  try {
    // Versuche, FFmpeg direkt auszuführen
    const { stdout, stderr } = await execAsync(`"${ffmpegPath}" -version`);
    if (stderr && stderr.trim().length > 0) {
      console.warn('FFmpeg version check warning:', stderr);
    }
    const version = stdout.split('\n')[0];
    console.log('FFmpeg version:', version);
    return { available: true, version };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error checking FFmpeg version:', errorMessage);
    return { 
      available: false, 
      error: errorMessage,
    };
  }
};

// Run the check immediately
checkFFmpegAvailability().then(result => {
  if (!result.available) {
    console.error('WARNING: FFmpeg is not available or not working correctly. Video generation may fail.');
    console.error('Error details:', result.error);
    console.error('Please install FFmpeg on your system:');
    console.error('- macOS: brew install ffmpeg');
    console.error('- Windows: choco install ffmpeg');
    console.error('- Linux: apt-get install ffmpeg');
  }
});

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
  format?: string;
  bitrate?: number;
  codec?: string;
};

// Create a temporary directory for processing
export const getTempDir = async (): Promise<string> => {
  try {
    const tempDir = path.join(os.tmpdir(), 'ai-ad-generator', uuidv4());
    await fs.ensureDir(tempDir);
    console.log(`Created temporary directory: ${tempDir}`);
    return tempDir;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to create temporary directory: ${errorMessage}`);
    throw new Error(`Failed to create temporary directory: ${errorMessage}`);
  }
};

// Download a file from URL to local path
export const downloadFile = async (url: string, outputPath: string): Promise<string> => {
  try {
    console.log(`Downloading file from ${url} to ${outputPath}`);
    
    // If the URL is a local file path (starts with /), just copy it
    if (url.startsWith('/') || url.startsWith('file://')) {
      const sourcePath = url.replace('file://', '');
      
      // Check if source file exists
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source file does not exist: ${sourcePath}`);
      }
      
      await fs.copy(sourcePath, outputPath);
      console.log(`File copied from ${sourcePath} to ${outputPath}`);
      
      // Verify the file was copied successfully
      if (!fs.existsSync(outputPath)) {
        throw new Error(`Failed to copy file to ${outputPath}`);
      }
      
      const stats = fs.statSync(outputPath);
      if (stats.size === 0) {
        throw new Error(`Copied file is empty: ${outputPath}`);
      }
      
      return outputPath;
    }

    // Otherwise, download from remote URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download file from ${url}: ${response.statusText} (${response.status})`);
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error(`Downloaded file is empty from ${url}`);
    }
    
    await fs.writeFile(outputPath, Buffer.from(buffer));
    
    // Verify the file was written successfully
    if (!fs.existsSync(outputPath)) {
      throw new Error(`Failed to write file to ${outputPath}`);
    }
    
    const stats = fs.statSync(outputPath);
    console.log(`Downloaded file size: ${stats.size} bytes`);
    
    if (stats.size === 0) {
      throw new Error(`Downloaded file is empty: ${outputPath}`);
    }
    
    return outputPath;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error downloading file: ${errorMessage}`);
    throw new Error(`Failed to download file: ${errorMessage}`);
  }
};

// Get video information using ffmpeg
export const getVideoInfo = async (videoPath: string): Promise<VideoInfo> => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(videoPath)) {
      return reject(new Error(`Video file does not exist: ${videoPath}`));
    }
    
    const stats = fs.statSync(videoPath);
    if (stats.size === 0) {
      return reject(new Error(`Video file is empty: ${videoPath}`));
    }
    
    console.log(`Getting video info for: ${videoPath}`);
    
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        console.error(`FFprobe error for ${videoPath}:`, err);
        return reject(new Error(`Failed to probe video file: ${err.message}`));
      }

      const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
      if (!videoStream) {
        return reject(new Error(`No video stream found in file: ${videoPath}`));
      }

      // Calculate FPS
      let fps;
      if (videoStream.r_frame_rate) {
        const [numerator, denominator] = videoStream.r_frame_rate.split('/').map(Number);
        fps = numerator / denominator;
      }

      const info = {
        width: videoStream.width || 1920,
        height: videoStream.height || 1080,
        duration: metadata.format.duration ? Number(metadata.format.duration) : 0,
        fps,
        format: metadata.format.format_name,
        bitrate: metadata.format.bit_rate ? Number(metadata.format.bit_rate) : undefined,
        codec: videoStream.codec_name
      };
      
      console.log(`Video info for ${videoPath}:`, info);
      resolve(info);
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
  console.log(`Starting video combination process`);
  console.log(`Voiceover path: ${voiceoverPath}`);
  console.log(`Output path: ${outputPath}`);
  console.log(`Number of video segments: ${videoSegments.length}`);
  
  // Validate inputs
  if (!fs.existsSync(voiceoverPath)) {
    throw new Error(`Voiceover file does not exist: ${voiceoverPath}`);
  }
  
  const voiceoverStats = fs.statSync(voiceoverPath);
  if (voiceoverStats.size === 0) {
    throw new Error(`Voiceover file is empty: ${voiceoverPath}`);
  }
  
  if (videoSegments.length === 0) {
    throw new Error('No video segments provided for processing');
  }
  
  // Check if all video files exist
  for (const segment of videoSegments) {
    if (!fs.existsSync(segment.url)) {
      throw new Error(`Video file does not exist: ${segment.url} for segment at position ${segment.position}`);
    }
    
    const stats = fs.statSync(segment.url);
    if (stats.size === 0) {
      throw new Error(`Video file is empty: ${segment.url} for segment at position ${segment.position}`);
    }
  }
  
  return new Promise((resolve, reject) => {
    try {
      // Create a command
      let command = ffmpeg();
      console.log('FFmpeg command created');

      // Add voiceover input
      command.input(voiceoverPath);
      console.log(`Added voiceover input: ${voiceoverPath}`);

      // Add video inputs
      videoSegments.forEach((segment, index) => {
        command.input(segment.url);
        console.log(`Added video input ${index + 1}: ${segment.url} (start: ${segment.startTime}, duration: ${segment.duration})`);
      });

      // Create filter complex string
      let filterComplex: string[] = [];
      let videoInputs: string[] = [];

      // Process each video segment
      videoSegments.forEach((segment, index) => {
        // Scale video to 1920x1080 while maintaining aspect ratio
        const filterPart = `[${index + 1}:v]trim=${segment.startTime}:${segment.startTime + segment.duration},setpts=PTS-STARTPTS,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[v${index}]`;
        filterComplex.push(filterPart);
        videoInputs.push(`[v${index}]`);
        console.log(`Added filter for video segment ${index + 1}: ${filterPart}`);
      });

      // Concatenate all video segments
      const concatFilter = `${videoInputs.join('')}concat=n=${videoSegments.length}:v=1:a=0[outv]`;
      filterComplex.push(concatFilter);
      console.log(`Added concatenation filter: ${concatFilter}`);

      // Process audio
      filterComplex.push(`[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[outa]`);
      
      // Log the complete filter complex
      const filterComplexString = filterComplex.join(';');
      console.log(`Complete filter complex: ${filterComplexString}`);

      // Apply filter complex
      command.complexFilter(filterComplexString);

      // Map outputs
      command.map('[outv]');
      command.map('[outa]');

      // Set output options
      const outputOptions = [
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest'
      ];
      
      command.outputOptions(outputOptions);
      console.log(`Set output options: ${outputOptions.join(' ')}`);
      
      command.output(outputPath);
      console.log(`Set output path: ${outputPath}`);

      // Add progress handler
      if (progressCallback) {
        command.on('progress', (progress) => {
          if (progress.percent) {
            const percent = Math.min(progress.percent, 100);
            progressCallback(percent);
            console.log(`FFmpeg progress: ${percent.toFixed(2)}%`);
          }
        });
      }

      // Add event handlers
      command
        .on('start', (commandLine) => {
          console.log(`FFmpeg command started: ${commandLine}`);
        })
        .on('end', () => {
          console.log(`FFmpeg command completed successfully`);
          
          // Verify the output file exists and is not empty
          if (!fs.existsSync(outputPath)) {
            return reject(new Error(`Output file was not created: ${outputPath}`));
          }
          
          const stats = fs.statSync(outputPath);
          console.log(`Output file size: ${stats.size} bytes`);
          
          if (stats.size === 0) {
            return reject(new Error(`Output file is empty: ${outputPath}`));
          }
          
          resolve(outputPath);
        })
        .on('error', (err, stdout, stderr) => {
          console.error(`FFmpeg error: ${err.message}`);
          console.error(`FFmpeg stderr: ${stderr}`);
          reject(new Error(`FFmpeg processing failed: ${err.message}\n\nDetails: ${stderr}`));
        });

      // Run the command
      console.log('Running FFmpeg command...');
      command.run();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error setting up FFmpeg command: ${errorMessage}`);
      reject(new Error(`Failed to set up FFmpeg command: ${errorMessage}`));
    }
  });
};

// Clean up temporary files and directories
export const cleanupTempFiles = async (files: string[], directories: string[] = []): Promise<void> => {
  console.log(`Cleaning up ${files.length} temporary files and ${directories.length} directories`);
  
  // Remove files
  for (const file of files) {
    try {
      if (fs.existsSync(file)) {
        await fs.remove(file);
        console.log(`Removed temporary file: ${file}`);
      }
    } catch (error) {
      console.error(`Failed to remove file ${file}:`, error);
    }
  }

  // Remove directories
  for (const dir of directories) {
    try {
      if (fs.existsSync(dir)) {
        await fs.remove(dir);
        console.log(`Removed temporary directory: ${dir}`);
      }
    } catch (error) {
      console.error(`Failed to remove directory ${dir}:`, error);
    }
  }
};

// Combine videos without re-encoding using concat demuxer
export const concatVideosWithoutReencoding = async (
  videoPaths: string[],
  outputPath: string
): Promise<string> => {
  console.log(`Starting video concatenation process without re-encoding`);
  console.log(`Number of videos to concatenate: ${videoPaths.length}`);
  console.log(`Output path: ${outputPath}`);
  
  // Validate inputs
  if (videoPaths.length === 0) {
    throw new Error('No video paths provided for concatenation');
  }
  
  for (const videoPath of videoPaths) {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file does not exist: ${videoPath}`);
    }
    
    const stats = fs.statSync(videoPath);
    if (stats.size === 0) {
      throw new Error(`Video file is empty: ${videoPath}`);
    }
  }
  
  // Create temporary directory for the file list
  const tempDir = await getTempDir();
  const fileListPath = path.join(tempDir, 'filelist.txt');
  
  // Create the file list content
  const fileListContent = videoPaths.map(videoPath => `file '${videoPath.replace(/'/g, "'\\''")}'`).join('\n');
  
  // Write the file list to disk
  await fs.writeFile(fileListPath, fileListContent);
  
  return new Promise((resolve, reject) => {
    // Create FFmpeg command
    const command = ffmpeg()
      .input(fileListPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions(['-c', 'copy']) // Copy streams without re-encoding
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log(`FFmpeg command: ${commandLine}`);
      })
      .on('progress', (progress) => {
        console.log(`Concatenation progress: ${JSON.stringify(progress)}`);
      })
      .on('end', () => {
        console.log(`Video concatenation completed: ${outputPath}`);
        // Clean up the temporary file list
        fs.unlink(fileListPath, (err) => {
          if (err) console.error(`Error deleting temporary file list: ${err.message}`);
        });
        resolve(outputPath);
      })
      .on('error', (err) => {
        console.error(`Error during video concatenation: ${err.message}`);
        reject(new Error(`Failed to concatenate videos: ${err.message}`));
      });
    
    // Run the command
    command.run();
  });
}; 