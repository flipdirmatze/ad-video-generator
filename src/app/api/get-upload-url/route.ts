import { NextRequest, NextResponse } from 'next/server';
import { getPresignedUploadUrl, generateUniqueFileName, S3BucketFolder } from '@/lib/storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    console.log('Starting presigned URL generation process');
    
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      console.error('Presigned URL error: Unauthorized - No session or user ID');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('User authenticated:', session.user.id);

    // Request-Body-Daten parsen
    const data = await request.json();
    const { fileName, contentType, folder = 'uploads' } = data;

    console.log(`Presigned URL request params - fileName: ${fileName}, contentType: ${contentType}, folder: ${folder}`);

    if (!fileName || !contentType) {
      console.error('Presigned URL error: Missing required fields');
      return NextResponse.json(
        { error: 'fileName and contentType are required' },
        { status: 400 }
      );
    }

    // Validiere Folder-Typ
    if (!['uploads', 'processed', 'final', 'audio'].includes(folder)) {
      console.error(`Presigned URL error: Invalid folder type: ${folder}`);
      return NextResponse.json(
        { error: 'Invalid folder type' },
        { status: 400 }
      );
    }

    // Überprüfe AWS Konfiguration
    if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.S3_BUCKET_NAME) {
      console.error('Presigned URL error: Missing AWS configuration variables');
      return NextResponse.json(
        { error: 'S3 configuration is incomplete. Check environment variables.' },
        { status: 500 }
      );
    }

    console.log(`Using AWS Region: ${process.env.AWS_REGION}, Bucket: ${process.env.S3_BUCKET_NAME}`);

    // Eindeutigen Dateinamen generieren
    const uniqueFileName = generateUniqueFileName(fileName);
    console.log(`Generated unique filename: ${uniqueFileName}`);
    
    // Presigned URL generieren
    try {
      const uploadData = await getPresignedUploadUrl(
        uniqueFileName,
        contentType,
        folder as S3BucketFolder,
        // 5 Minuten gültig, mehr Zeit für große Dateien
        300
      );
      
      console.log(`Successfully generated presigned URL for S3 path: ${uploadData.key}`);

      // Erfolgreich zurückgeben
      return NextResponse.json({
        success: true,
        uploadUrl: uploadData.url,
        fileUrl: uploadData.fileUrl,
        key: uploadData.key,
        fileName: uniqueFileName
      });
    } catch (s3Error) {
      console.error('Error generating S3 presigned URL:', s3Error);
      return NextResponse.json(
        { 
          error: 'Failed to generate S3 upload URL', 
          details: s3Error instanceof Error ? s3Error.message : String(s3Error),
          awsConfig: {
            region: process.env.AWS_REGION ? 'Configured' : 'Missing',
            accessKey: process.env.AWS_ACCESS_KEY_ID ? 'Configured' : 'Missing',
            secretKey: process.env.AWS_SECRET_ACCESS_KEY ? 'Configured' : 'Missing',
            bucket: process.env.S3_BUCKET_NAME
          }
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in presigned URL generation:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate upload URL', 
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 