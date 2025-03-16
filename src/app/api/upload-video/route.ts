import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { uploadToS3 } from '@/lib/storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';

// Konfiguriere die maximale Dateigröße (500MB)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '500mb'
    }
  }
};

export async function POST(request: Request) {
  // Unique request ID für Logging
  const requestId = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  try {
    console.log(`[${requestId}] Video upload request started`);
    
    // Get session to identify user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.log(`[${requestId}] Unauthorized: No session or user ID`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    console.log(`[${requestId}] User authenticated: ${session.user.id}`);
    
    // Prüfen, ob der Content-Type application/json ist (direkter S3-Upload) oder multipart/form-data (regulärer Upload)
    const contentType = request.headers.get('content-type') || '';
    console.log(`[${requestId}] Content type: ${contentType}`);

    if (contentType.includes('application/json')) {
      // Direkter S3-Upload: Diese Metadaten kommen vom Frontend, nachdem die Datei direkt zu S3 hochgeladen wurde
      console.log(`[${requestId}] Processing JSON upload data (direct S3 upload)`);
      const data = await request.json();
      const { videoId, name, size, type, key, url, tags } = data;
      
      if (!videoId || !name || !size || !type || !key || !url) {
        console.error(`[${requestId}] Missing required fields: ${JSON.stringify({ videoId, name, size, type, key, url })}`);
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      
      // Mit Mongoose zur Datenbank verbinden
      console.log(`[${requestId}] Connecting to database`);
      try {
        await dbConnect();
      } catch (dbError) {
        console.error(`[${requestId}] Database connection error:`, dbError);
        return NextResponse.json({ 
          error: 'Database connection failed', 
          details: dbError instanceof Error ? dbError.message : String(dbError) 
        }, { status: 500 });
      }
      
      // Speichere Metadaten in der Datenbank
      console.log(`[${requestId}] Creating video document with ID: ${videoId}`);
      try {
        const video = await VideoModel.create({
          id: videoId,
          userId: session.user.id,
          name: name,
          originalFilename: name,
          size: size,
          type: type,
          path: key.startsWith('uploads/') ? key : `uploads/${key}`,
          tags: tags || [],
          isPublic: false,
          status: 'complete',
          progress: 100
        });
        
        console.log(`[${requestId}] Video document created successfully: ${video._id}`);
        
        return NextResponse.json({
          success: true,
          videoId: video.id,
          key: video.path
        });
      } catch (unknownError) {
        console.error(`[${requestId}] Error creating video document:`, unknownError);
        
        // Vereinfachte Fehlerbehandlung ohne komplexe Typprüfungen
        const error = unknownError as Error;
        return NextResponse.json({ 
          error: 'Failed to save video metadata', 
          details: error.message || String(unknownError)
        }, { status: 500 });
      }
    } else {
      // Regulärer Upload über FormData
      console.log(`[${requestId}] Processing FormData upload (regular upload)`);
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const tags = formData.get('tags') as string;
      const videoId = formData.get('videoId') as string || uuidv4();
      
      if (!file) {
        console.error(`[${requestId}] No file provided`);
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      // Check file size limit (500MB)
      const MAX_SIZE = 500 * 1024 * 1024; // 500MB in Bytes
      if (file.size > MAX_SIZE) {
        console.error(`[${requestId}] File too large: ${file.size} bytes`);
        return NextResponse.json({ 
          error: 'File too large',
          maxSize: '500MB',
          actualSize: `${Math.round(file.size / (1024 * 1024))}MB`
        }, { status: 413 });
      }
      
      // Generate unique ID and filename
      const uniqueId = videoId;
      const fileExtension = file.name.split('.').pop();
      const uniqueFileName = `${uniqueId}.${fileExtension}`;
      
      console.log(`[${requestId}] Uploading file to S3: ${uniqueFileName} (${Math.round(file.size / (1024 * 1024))}MB)`);
      
      try {
        // Convert file to buffer in chunks to handle large files
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Upload to S3 with error handling
        const fileUrl = await uploadToS3(buffer, uniqueFileName, file.type);
        console.log(`[${requestId}] File uploaded to S3: ${fileUrl}`);
        
        // Mit Mongoose zur Datenbank verbinden
        console.log(`[${requestId}] Connecting to database`);
        await dbConnect();
        
        // Save metadata to database
        console.log(`[${requestId}] Creating video document with ID: ${uniqueId}`);
        const video = await VideoModel.create({
          id: uniqueId,
          userId: session.user.id,
          name: file.name,
          originalFilename: file.name,
          size: file.size,
          type: file.type,
          path: `uploads/${uniqueFileName}`,
          tags: tags ? JSON.parse(tags) : [],
          isPublic: false,
          status: 'complete',
          progress: 100
        });
        
        console.log(`[${requestId}] Video document created successfully: ${video._id}`);
        
        return NextResponse.json({
          success: true,
          videoId: video.id,
          key: video.path
        });
      } catch (error) {
        console.error(`[${requestId}] Error during upload:`, error);
        return NextResponse.json({ 
          error: 'Upload failed',
          details: error instanceof Error ? error.message : String(error)
        }, { status: 500 });
      }
    }
  } catch (error) {
    console.error(`[${requestId || 'unknown'}] Upload error:`, error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 