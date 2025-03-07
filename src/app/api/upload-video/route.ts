import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { uploadToS3 } from '@/lib/storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import prisma from '@/lib/prisma'; // Annahme, dass Sie zu Prisma wechseln für bessere Typsicherheit

export async function POST(request: Request) {
  try {
    // Get session to identify user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Get form data from request
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
    
    // Save metadata to database
    const videoRecord = await prisma.video.create({
      data: {
        id: uniqueId,
        name: file.name,
        url: fileUrl,
        size: file.size,
        type: file.type,
        tags: tags ? JSON.parse(tags) : [],
        userId: session.user.id,
      },
    });
    
    return NextResponse.json({
      success: true,
      fileUrl: fileUrl,
      fileName: uniqueFileName,
      fileId: uniqueId
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 