import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { 
  VideoSegment, 
  getTempDir, 
  downloadFile, 
  combineVideosWithVoiceover, 
  cleanupTempFiles,
  checkFFmpegAvailability,
  getVideoInfo
} from '@/utils/ffmpeg-utils';

// Ensure the output directory exists
async function ensureOutputDir() {
  const outputDir = path.join(process.cwd(), 'public', 'outputs');
  if (!fs.existsSync(outputDir)) {
    await fs.mkdir(outputDir, { recursive: true });
  }
  return outputDir;
}

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

// Error types for better client-side handling
type ErrorResponse = {
  error: string;
  code: string;
  details?: any;
  suggestions?: string[];
}

export async function POST(request: Request) {
  console.log('Starting video generation process');
  
  // Überprüfe zuerst, ob FFmpeg verfügbar ist
  const ffmpegStatus = await checkFFmpegAvailability();
  if (!ffmpegStatus.available) {
    console.error('FFmpeg is not available:', ffmpegStatus.error);
    return NextResponse.json({
      error: 'FFmpeg ist nicht installiert oder funktioniert nicht korrekt',
      code: 'FFMPEG_NOT_AVAILABLE',
      details: ffmpegStatus.error,
      suggestions: [
        'Installieren Sie FFmpeg auf Ihrem System:',
        '- macOS: brew install ffmpeg (Homebrew muss installiert sein)',
        '- Windows: choco install ffmpeg (Chocolatey muss installiert sein)',
        '- Linux: sudo apt-get install ffmpeg',
        'Stellen Sie sicher, dass FFmpeg in Ihrem PATH ist',
        'Starten Sie die Anwendung nach der Installation neu'
      ]
    }, { status: 500 });
  }
  
  // Temporäre Dateien und Verzeichnisse für die Bereinigung
  const tempFiles: string[] = [];
  const tempDirs: string[] = [];
  
  try {
    // Parse the request body
    let data: VideoRequest;
    try {
      data = await request.json();
      console.log('Request data received:', JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to parse request body:', error);
      return NextResponse.json(
        {
          error: 'Invalid request format',
          code: 'INVALID_REQUEST',
          details: error instanceof Error ? error.message : String(error),
          suggestions: ['Ensure the request body is valid JSON']
        } as ErrorResponse,
        { status: 400 }
      );
    }
    
    // Validate required fields
    if (!data.voiceoverUrl) {
      console.error('Missing voiceover URL in request');
      return NextResponse.json(
        {
          error: 'Missing voiceover URL',
          code: 'MISSING_VOICEOVER',
          suggestions: ['Provide a valid voiceover URL in the request']
        } as ErrorResponse,
        { status: 400 }
      );
    }
    
    if (!data.segments || data.segments.length === 0) {
      console.error('Missing or empty segments array in request');
      return NextResponse.json(
        {
          error: 'No video segments provided',
          code: 'NO_SEGMENTS',
          suggestions: ['Add at least one video segment to the request']
        } as ErrorResponse,
        { status: 400 }
      );
    }
    
    if (!data.videos || data.videos.length === 0) {
      console.error('Missing or empty videos array in request');
      return NextResponse.json(
        {
          error: 'No videos provided',
          code: 'NO_VIDEOS',
          suggestions: ['Add at least one video to the request']
        } as ErrorResponse,
        { status: 400 }
      );
    }
    
    // Create a temporary directory for processing
    let tempDir;
    try {
      tempDir = await getTempDir();
      tempDirs.push(tempDir);
      console.log('Created temp directory:', tempDir);
    } catch (error) {
      console.error('Failed to create temporary directory:', error);
      return NextResponse.json(
        {
          error: 'Failed to create temporary directory',
          code: 'TEMP_DIR_ERROR',
          details: error instanceof Error ? error.message : String(error),
          suggestions: ['Check server disk space and permissions']
        } as ErrorResponse,
        { status: 500 }
      );
    }
    
    // Download the voiceover
    console.log('Processing voiceover:', data.voiceoverUrl);
    const voiceoverFileName = `voiceover-${uuidv4()}.mp3`;
    const voiceoverPath = path.join(tempDir, voiceoverFileName);
    
    try {
      // Handle local paths (starting with /)
      if (data.voiceoverUrl.startsWith('/')) {
        const sourcePath = path.join(process.cwd(), 'public', data.voiceoverUrl.slice(1));
        console.log('Copying from local path:', sourcePath);
        
        // Check if the source file exists
        if (!fs.existsSync(sourcePath)) {
          throw new Error(`Voiceover file not found: ${sourcePath}`);
        }
        
        await fs.copy(sourcePath, voiceoverPath);
        console.log('Voiceover file copied successfully');
      } else {
        console.log('Downloading from URL:', data.voiceoverUrl);
        await downloadFile(data.voiceoverUrl, voiceoverPath);
      }
      
      tempFiles.push(voiceoverPath);
      console.log('Voiceover downloaded to:', voiceoverPath);
    } catch (error) {
      console.error('Failed to process voiceover:', error);
      return NextResponse.json(
        {
          error: 'Failed to process voiceover',
          code: 'VOICEOVER_ERROR',
          details: error instanceof Error ? error.message : String(error),
          suggestions: [
            'Check if the voiceover file exists and is accessible',
            'Ensure the voiceover URL is valid',
            'Verify the voiceover file is not corrupted'
          ]
        } as ErrorResponse,
        { status: 500 }
      );
    }

    // Process video segments
    console.log('Processing video segments');
    const videoSegments: VideoSegment[] = [];
    const segmentErrors: Array<{segment: VideoRequestSegment, error: string}> = [];
    const segmentWarnings: Array<{segment: VideoRequestSegment, warning: string}> = [];
    
    console.log('Received segments:', JSON.stringify(data.segments, null, 2));
    console.log('Received videos:', JSON.stringify(data.videos, null, 2));
    
    // Check if any videos are using blob URLs
    const blobVideos = data.videos.filter(v => v.url.startsWith('blob:'));
    if (blobVideos.length > 0) {
      console.error(`Found ${blobVideos.length} videos with blob URLs that cannot be processed server-side`);
      return NextResponse.json(
        {
          error: 'Videos with blob URLs cannot be processed',
          code: 'BLOB_URLS_NOT_SUPPORTED',
          details: {
            blobVideos: blobVideos.map(v => v.id)
          },
          suggestions: [
            'Upload your videos to the server first using the Upload page',
            'After uploading, the videos will be available for server-side processing'
          ]
        } as ErrorResponse,
        { status: 400 }
      );
    }
    
    for (const segment of data.segments) {
      try {
        const video = data.videos.find(v => v.id === segment.videoId);
        if (!video) {
          console.log('Video not found for segment:', segment);
          console.log('Available video IDs:', data.videos.map(v => v.id));
          segmentErrors.push({
            segment,
            error: `Video with ID ${segment.videoId} not found`
          });
          continue;
        }
        
        console.log('Processing video:', video.url);
        const videoFileName = `video-${segment.videoId}.mp4`;
        const videoPath = path.join(tempDir, videoFileName);
        
        // Handle local paths (starting with /)
        if (video.url.startsWith('/')) {
          // The path needs to be relative to the public directory
          const sourcePath = path.join(process.cwd(), 'public', video.url.slice(1));
          console.log('Copying from local path:', sourcePath);
          
          // Check if the source file exists
          if (!fs.existsSync(sourcePath)) {
            console.error(`Source file does not exist: ${sourcePath}`);
            
            // Try alternative filenames that might match
            const uploadDir = path.join(process.cwd(), 'public', 'uploads');
            
            if (fs.existsSync(uploadDir)) {
              const files = await fs.readdir(uploadDir);
              console.log('Files in upload directory:', files);
              
              // Versuche verschiedene Matching-Strategien
              // 1. Exakte ID am Anfang des Dateinamens
              // 2. ID vor dem ersten "-"
              // 3. ID vor dem ersten "."
              let matchingFile = files.find(file => 
                file.startsWith(segment.videoId) || 
                file.split('-')[0] === segment.videoId || 
                file.split('.')[0] === segment.videoId
              );
              
              if (!matchingFile) {
                // Falls keine direkte Übereinstimmung gefunden wurde, suche nach Dateien, deren Anfang der ID entspricht
                // oder bei denen die ID in einem Teil des Namens enthalten ist
                matchingFile = files.find(file => {
                  const fileNameWithoutExt = file.split('.')[0];
                  return fileNameWithoutExt.includes(segment.videoId) || segment.videoId.includes(fileNameWithoutExt);
                });
              }
              
              if (matchingFile) {
                const altPath = path.join(uploadDir, matchingFile);
                console.log(`Found alternative file: ${altPath} for video ID ${segment.videoId}`);
                
                try {
                  await fs.copy(altPath, videoPath);
                  console.log('File copied successfully from alternative path');
                  tempFiles.push(videoPath);
                  
                  // Add to segments
                  videoSegments.push({
                    videoId: segment.videoId,
                    url: videoPath,
                    startTime: segment.startTime,
                    duration: segment.duration,
                    position: segment.position
                  });
                  
                  // Update video object for logging purposes
                  video.url = `/uploads/${matchingFile}`;
                  
                  continue; // Skip the rest of this iteration
                } catch (copyError) {
                  console.error(`Failed to copy alternative file: ${copyError}`);
                }
              } else {
                console.log(`No matching files found for video ID: ${segment.videoId}`);
              }
            } else {
              console.error(`Upload directory does not exist: ${uploadDir}`);
            }
            
            // Keine passende Datei gefunden, Fehler melden
            segmentErrors.push({
              segment,
              error: `Video file not found: ${sourcePath}. Available files: ${fs.existsSync(uploadDir) ? (await fs.readdir(uploadDir)).join(', ') : 'upload directory not found'}`
            });
            continue;
          }
          
          await fs.copy(sourcePath, videoPath);
          console.log('File copied successfully');
        } else if (video.url.startsWith('http')) {
          console.log('Downloading from URL:', video.url);
          await downloadFile(video.url, videoPath);
        } else {
          console.error(`Unsupported URL format: ${video.url}`);
          segmentErrors.push({
            segment,
            error: `Unsupported URL format. URLs must start with '/' (local) or 'http' (remote).`
          });
          continue;
        }
        
        // Check if the video file was successfully copied/downloaded
        if (!fs.existsSync(videoPath)) {
          console.error(`Video file was not created: ${videoPath}`);
          segmentErrors.push({
            segment,
            error: `Failed to download or copy video file`
          });
          continue;
        }
        
        const stats = fs.statSync(videoPath);
        console.log(`Video file size: ${stats.size} bytes`);
        
        if (stats.size === 0) {
          console.error(`Video file is empty: ${videoPath}`);
          segmentErrors.push({
            segment,
            error: `Video file is empty`
          });
          continue;
        }
        
        // Validate video file with ffprobe
        try {
          const videoInfo = await getVideoInfo(videoPath);
          console.log(`Video info for ${videoPath}:`, videoInfo);
          console.log(`Video info for segment ${segment.position}:`, videoInfo);
          
          // Check if the requested segment is within the video duration
          if (segment.startTime + segment.duration > videoInfo.duration) {
            console.warn(`Segment exceeds video duration: ${segment.startTime + segment.duration} > ${videoInfo.duration}`);
            
            // Adjust the segment duration to fit within the video
            if (segment.startTime < videoInfo.duration) {
              // We can still use this segment, but with adjusted duration
              const originalDuration = segment.duration;
              segment.duration = Math.max(0.1, videoInfo.duration - segment.startTime);
              
              console.log(`Adjusted segment duration from ${originalDuration}s to ${segment.duration}s`);
              
              // Add warning to the segment errors
              segmentWarnings.push({
                segment: { ...segment, duration: originalDuration },
                warning: `Segment duration was adjusted to fit video length (${segment.duration.toFixed(2)}s instead of ${originalDuration}s)`
              });
            } else {
              console.error(`Segment starts after video end: ${segment.startTime} >= ${videoInfo.duration}`);
              segmentErrors.push({
                segment,
                error: `Segment starts after video end (start: ${segment.startTime}s, video length: ${videoInfo.duration}s)`
              });
              continue;
            }
          }
        } catch (error) {
          console.error(`Failed to get video info for ${videoPath}:`, error);
          segmentErrors.push({
            segment,
            error: `Invalid video file: ${error instanceof Error ? error.message : String(error)}`
          });
          continue;
        }
        
        tempFiles.push(videoPath);
        console.log('Video downloaded to:', videoPath);
        
        // Add to segments
        videoSegments.push({
          videoId: segment.videoId,
          url: videoPath,
          startTime: segment.startTime,
          duration: segment.duration,
          position: segment.position
        });
      } catch (error) {
        console.error(`Error processing segment at position ${segment.position}:`, error);
        segmentErrors.push({
          segment,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // Check if we have valid segments to process
    if (videoSegments.length === 0) {
      console.error('No valid video segments to process');
      
      // Erstellen Sie eine nützliche Fehlermeldung basierend auf den gesammelten Fehlern
      let errorMessage = 'No valid video segments to process';
      let errorDetails: any = {};
      let suggestions: string[] = [
        'Check if all video files exist and are accessible',
        'Ensure segment start times and durations are valid',
        'Verify that video IDs match the provided videos'
      ];
      
      if (segmentErrors.length > 0) {
        errorDetails.errors = segmentErrors;
        
        // Analysieren Sie die häufigsten Fehlertypen
        const durationErrors = segmentErrors.filter(e => e.error.includes('duration'));
        const fileNotFoundErrors = segmentErrors.filter(e => e.error.includes('not found') || e.error.includes('does not exist'));
        const invalidFormatErrors = segmentErrors.filter(e => e.error.includes('Invalid video'));
        
        if (durationErrors.length > 0) {
          suggestions.push('Your videos are shorter than the requested duration. Try using shorter segments.');
          // Fügen Sie detaillierte Informationen zur Videolänge hinzu
          const videoLengths = durationErrors.map(e => {
            const match = e.error.match(/video: (\d+\.?\d*)s/);
            if (match && match[1]) {
              return `Video ${e.segment.videoId}: ${match[1]}s`;
            }
            return `Video ${e.segment.videoId}: too short`;
          });
          suggestions.push(`Available video lengths: ${videoLengths.join(', ')}`);
        }
        
        if (fileNotFoundErrors.length > 0) {
          suggestions.push('Some videos could not be found. Make sure you have uploaded them correctly.');
        }
        
        if (invalidFormatErrors.length > 0) {
          suggestions.push('Some videos have invalid formats. Try re-uploading them in a standard format like MP4.');
        }
      }
      
      if (segmentWarnings.length > 0) {
        errorDetails.warnings = segmentWarnings;
        suggestions.push('Some segments were adjusted to match video duration but all were still invalid.');
      }
      
      return NextResponse.json(
        {
          error: errorMessage,
          code: 'NO_VALID_SEGMENTS',
          details: errorDetails,
          suggestions: suggestions
        } as ErrorResponse,
        { status: 400 }
      );
    }
    
    // If some segments failed but we have at least one valid segment, log a warning
    if (segmentErrors.length > 0) {
      console.warn(`${segmentErrors.length} segments had errors and will be skipped:`, segmentErrors);
    }
    
    // Sort segments by position
    videoSegments.sort((a, b) => a.position - b.position);
    
    // Generate output paths
    const uniqueFileName = `final-${Date.now()}-${uuidv4()}.mp4`;
    const tempOutputPath = path.join(tempDir, uniqueFileName);
    const outputDir = await ensureOutputDir();
    const finalOutputPath = path.join(outputDir, uniqueFileName);
    
    // Combine videos with voiceover
    console.log('Combining videos with voiceover');
    console.log('Number of video segments:', videoSegments.length);

    try {
      await combineVideosWithVoiceover(
        voiceoverPath, 
        videoSegments, 
        tempOutputPath,
        (progress) => {
          console.log(`Processing progress: ${progress.toFixed(2)}%`);
        }
      );
      tempFiles.push(tempOutputPath);
      console.log('Videos combined successfully');
      
      // Check if the output file was created
      if (!fs.existsSync(tempOutputPath)) {
        throw new Error(`Output file was not created: ${tempOutputPath}`);
      }
      
      const stats = fs.statSync(tempOutputPath);
      console.log(`Output file size: ${stats.size} bytes`);
      
      if (stats.size === 0) {
        throw new Error(`Output file is empty: ${tempOutputPath}`);
      }
      
      // Copy the output file to the public directory
      await fs.copy(tempOutputPath, finalOutputPath);
      console.log('Final video copied to public directory');
      
      // Check if the final file was created
      if (!fs.existsSync(finalOutputPath)) {
        throw new Error(`Final file was not created: ${finalOutputPath}`);
      }
      
      const finalStats = fs.statSync(finalOutputPath);
      console.log(`Final file size: ${finalStats.size} bytes`);
      
      // Return success with the local URL
      const videoUrl = `/outputs/${uniqueFileName}`;
      console.log('Final video URL:', videoUrl);
      
      return NextResponse.json({
        success: true,
        videoUrl,
        message: 'Video generated successfully',
        warnings: segmentWarnings.length > 0 ? {
          skippedSegments: segmentWarnings.length,
          details: segmentWarnings
        } : undefined
      });
    } catch (error) {
      console.error('Error in video combination:', error);
      
      // Provide more specific error messages based on the error
      const errorMessage = error instanceof Error ? error.message : String(error);
      let errorCode = 'FFMPEG_ERROR';
      let suggestions = [
        'Check the FFmpeg logs for more details',
        'Ensure all video files are valid and not corrupted',
        'Verify that the voiceover file is a valid audio file'
      ];
      
      // Try to identify specific error types
      if (errorMessage.includes('No such file or directory')) {
        errorCode = 'FILE_NOT_FOUND';
        suggestions = [
          'Check if all input files exist and are accessible',
          'Verify file paths are correct'
        ];
      } else if (errorMessage.includes('Invalid data found when processing input')) {
        errorCode = 'INVALID_INPUT';
        suggestions = [
          'One or more input files may be corrupted',
          'Check if all video files are valid MP4 files',
          'Verify that the voiceover file is a valid audio file'
        ];
      } else if (errorMessage.includes('Permission denied')) {
        errorCode = 'PERMISSION_ERROR';
        suggestions = [
          'Check file and directory permissions',
          'Ensure the application has write access to the output directory'
        ];
      } else if (errorMessage.includes('Out of memory')) {
        errorCode = 'OUT_OF_MEMORY';
        suggestions = [
          'The server may not have enough memory to process the videos',
          'Try with smaller video files or fewer segments'
        ];
      } else if (errorMessage.includes('Disk quota exceeded') || errorMessage.includes('No space left on device')) {
        errorCode = 'DISK_SPACE_ERROR';
        suggestions = [
          'The server may be out of disk space',
          'Free up disk space or use smaller video files'
        ];
      }
      
      return NextResponse.json(
        {
          error: `Failed to generate video: ${errorMessage}`,
          code: errorCode,
          details: error,
          suggestions
        } as ErrorResponse,
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error generating final video:', error);
    return NextResponse.json(
      {
        error: `Failed to generate video: ${error instanceof Error ? error.message : String(error)}`,
        code: 'GENERAL_ERROR',
        details: error,
        suggestions: [
          'Check the server logs for more details',
          'Ensure all input files are valid and accessible',
          'Verify that FFmpeg is properly installed and configured'
        ]
      } as ErrorResponse,
      { status: 500 }
    );
  } finally {
    // Clean up temporary files
    await cleanupTempFiles(tempFiles, tempDirs);
  }
} 