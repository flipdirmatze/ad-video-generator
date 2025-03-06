import { NextResponse } from 'next/server';
import fs from 'fs-extra';
import path from 'path';

interface FileInfo {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: Date;
  // ID is extracted from the filename if possible (everything before the first dash or dot)
  id: string;
}

export async function GET() {
  try {
    // Path to the uploads directory
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    
    // Check if directory exists
    if (!fs.existsSync(uploadsDir)) {
      return NextResponse.json({
        files: [],
        message: 'Uploads directory does not exist'
      });
    }
    
    // Read the directory content
    const files = await fs.readdir(uploadsDir);
    
    // Filter for video files only and gather more information
    const videoFiles: FileInfo[] = [];
    
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (['.mp4', '.mov', '.webm', '.avi', '.wmv', '.mkv'].includes(ext)) {
        const filePath = path.join(uploadsDir, file);
        const stats = await fs.stat(filePath);
        
        // Try to extract ID from filename
        // Pattern can be either 'id.ext', 'id-suffix.ext', etc.
        let id = file.split('.')[0]; // Default to everything before first dot
        if (id.includes('-')) {
          id = id.split('-')[0]; // Take only the part before the first dash
        }
        
        videoFiles.push({
          name: file,
          path: `/uploads/${file}`,
          size: stats.size,
          type: `video/${ext.slice(1)}`, // Remove the dot from extension
          lastModified: stats.mtime,
          id: id
        });
      }
    }
    
    // Sort by last modified date, newest first
    videoFiles.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    
    return NextResponse.json({
      files: videoFiles,
      count: videoFiles.length,
      baseNames: files.filter(f => path.extname(f).toLowerCase() === '.mp4'),
      directory: uploadsDir
    });
  } catch (error) {
    console.error('Error listing uploads:', error);
    return NextResponse.json(
      { 
        error: 'Failed to list uploads', 
        details: error instanceof Error ? error.message : String(error),
        path: path.join(process.cwd(), 'public', 'uploads')
      },
      { status: 500 }
    );
  }
} 