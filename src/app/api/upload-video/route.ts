import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { uploadToS3 } from '@/lib/storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import VideoModel from '@/models/Video';

export async function POST(request: Request) {
  try {
    // Get session to identify user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Prüfen, ob der Content-Type application/json ist (direkter S3-Upload) oder multipart/form-data (regulärer Upload)
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      // Direkter S3-Upload: Diese Metadaten kommen vom Frontend, nachdem die Datei direkt zu S3 hochgeladen wurde
      const data = await request.json();
      const { videoId, name, size, type, key, url, tags } = data;
      
      if (!videoId || !name || !size || !type || !key || !url) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      }
      
      // Mit Mongoose zur Datenbank verbinden
      await dbConnect();
      
      // Speichere Metadaten in der Datenbank
      const video = await VideoModel.create({
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
      
      return NextResponse.json({
        success: true,
        videoId: video._id,
        fileUrl: url
      });
    } else {
      // Regulärer Upload über FormData
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const tags = formData.get('tags') as string;
      const videoId = formData.get('videoId') as string;
      
      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      // Check file size limit (e.g., 500MB)
      const MAX_SIZE = 500 * 1024 * 1024;
      if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: 'File too large' }, { status: 400 });
      }
      
      // Generate unique ID and filename
      const uniqueId = videoId || uuidv4();
      const fileExtension = file.name.split('.').pop();
      const uniqueFileName = `${uniqueId}.${fileExtension}`;
      
      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload to S3
      const fileUrl = await uploadToS3(buffer, uniqueFileName, file.type);
      
      // Mit Mongoose zur Datenbank verbinden
      await dbConnect();
      
      // Save metadata to database
      const video = await VideoModel.create({
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
      
      return NextResponse.json({
        success: true,
        fileUrl: fileUrl,
        fileName: uniqueFileName,
        fileId: uniqueId
      });
    }
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 