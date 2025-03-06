import { NextResponse } from 'next/server';
import fs from 'fs-extra';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Function to ensure the upload directory exists
async function ensureUploadDir() {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadDir)) {
    await fs.mkdir(uploadDir, { recursive: true });
  }
  return uploadDir;
}

export async function POST(request: Request) {
  try {
    // Get form data from request
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const tags = formData.get('tags') as string;
    const videoId = formData.get('videoId') as string;  // Get video ID from form data
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log('Received file upload request:', {
      name: file.name,
      size: file.size,
      type: file.type,
      videoId
    });

    // Generate a filename based on the video ID and original extension
    const fileExtension = file.name.split('.').pop();
    const uniqueId = videoId || uuidv4();
    const uniqueFileName = `${uniqueId}.${fileExtension}`;
    
    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Always save locally, skipping AWS entirely
    console.log('Saving file locally');
    const uploadDir = await ensureUploadDir();
    const filePath = path.join(uploadDir, uniqueFileName);
    
    // Write file to disk
    await fs.writeFile(filePath, buffer);
    
    console.log(`File saved to ${filePath}`);
    
    // Return success with local file URL
    return NextResponse.json({
      success: true,
      fileUrl: `/uploads/${uniqueFileName}`,
      fileName: uniqueFileName,
      fileId: uniqueId,
      isLocal: true
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 