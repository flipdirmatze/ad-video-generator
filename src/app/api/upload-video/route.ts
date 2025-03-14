import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { uploadToS3 } from '@/lib/storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';

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
          id: videoId, // Explizit die id setzen
          userId: session.user.id,
          name: name,
          originalFilename: name,
          size: size,
          type: type,
          path: key,
          url: url,
          tags: tags || [],
          isPublic: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log(`[${requestId}] Video document created successfully: ${video._id}`);
        
        return NextResponse.json({
          success: true,
          videoId: video._id,
          fileUrl: url
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
      const videoId = formData.get('videoId') as string || uuidv4(); // Stelle sicher, dass immer eine ID existiert
      
      if (!file) {
        console.error(`[${requestId}] No file provided`);
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      // Check file size limit (e.g., 500MB)
      const MAX_SIZE = 500 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        console.error(`[${requestId}] File too large: ${file.size} bytes`);
        return NextResponse.json({ error: 'File too large' }, { status: 400 });
      }
      
      // Generate unique ID and filename
      const uniqueId = videoId;
      const fileExtension = file.name.split('.').pop();
      const uniqueFileName = `${uniqueId}.${fileExtension}`;
      
      console.log(`[${requestId}] Uploading file to S3: ${uniqueFileName}`);
      
      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to S3
      let fileUrl;
      try {
        fileUrl = await uploadToS3(buffer, uniqueFileName, file.type);
        console.log(`[${requestId}] File uploaded to S3: ${fileUrl}`);
      } catch (s3Error) {
        console.error(`[${requestId}] S3 upload error:`, s3Error);
        return NextResponse.json({ 
          error: 'Failed to upload to S3', 
          details: s3Error instanceof Error ? s3Error.message : String(s3Error) 
        }, { status: 500 });
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
      
      // Save metadata to database
      console.log(`[${requestId}] Creating video document with ID: ${uniqueId}`);
      try {
        const video = await VideoModel.create({
          id: uniqueId, // Explizit die id setzen
          userId: session.user.id,
          name: file.name,
          originalFilename: file.name,
          size: file.size,
          type: file.type,
          path: `uploads/${uniqueFileName}`,
          url: fileUrl,
          tags: tags ? JSON.parse(tags) : [],
          isPublic: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log(`[${requestId}] Video document created successfully: ${video._id}`);
        
        return NextResponse.json({
          success: true,
          fileUrl: fileUrl,
          fileName: uniqueFileName,
          fileId: uniqueId
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
    }
  } catch (error) {
    console.error(`[${requestId || 'unknown'}] Upload error:`, error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 