import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { awsConfig } from '@/utils/aws-config';

// Initialize S3 client
const s3Client = new S3Client({
  region: awsConfig.region,
  credentials: {
    accessKeyId: awsConfig.accessKeyId!,
    secretAccessKey: awsConfig.secretAccessKey!,
  },
});

export async function POST(request: Request) {
  try {
    // Check if AWS is configured
    if (!awsConfig.accessKeyId || !awsConfig.secretAccessKey || !awsConfig.bucketName) {
      return NextResponse.json(
        { error: 'AWS credentials not configured' },
        { status: 500 }
      );
    }

    // Get form data from request
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const tags = formData.get('tags') as string;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Generate a unique file name
    const fileExtension = file.name.split('.').pop();
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;
    
    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to S3
    const params = {
      Bucket: awsConfig.bucketName,
      Key: `uploads/${uniqueFileName}`,
      Body: buffer,
      ContentType: file.type,
      Metadata: {
        tags: tags || '',
      },
    };

    await s3Client.send(new PutObjectCommand(params));

    // Return success with file URL
    return NextResponse.json({
      success: true,
      fileUrl: `https://${awsConfig.bucketName}.s3.${awsConfig.region}.amazonaws.com/uploads/${uniqueFileName}`,
      fileName: uniqueFileName,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
} 