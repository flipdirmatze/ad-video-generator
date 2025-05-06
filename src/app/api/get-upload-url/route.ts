import { NextRequest, NextResponse } from 'next/server';
import { getPresignedUploadUrl, generateUniqueFileName, S3BucketFolder } from '@/lib/storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  // Verbesserte Fehlerbehandlung
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  
  try {
    console.log(`[${requestId}] Starting presigned URL generation process`);
    
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      console.error(`[${requestId}] Presigned URL error: Unauthorized - No session or user ID`);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log(`[${requestId}] User authenticated: ${session.user.id}`);

    // Request-Body-Daten parsen
    const data = await request.json();
    const { fileName, contentType, folder = 'uploads' } = data;

    console.log(`[${requestId}] Presigned URL request params - fileName: ${fileName}, contentType: ${contentType}, folder: ${folder}`);

    if (!fileName || !contentType) {
      console.error(`[${requestId}] Presigned URL error: Missing required fields`);
      return NextResponse.json(
        { error: 'fileName and contentType are required' },
        { status: 400 }
      );
    }

    // Validiere Folder-Typ
    if (!['uploads', 'processed', 'final', 'audio'].includes(folder)) {
      console.error(`[${requestId}] Presigned URL error: Invalid folder type: ${folder}`);
      return NextResponse.json(
        { error: 'Invalid folder type' },
        { status: 400 }
      );
    }

    // Überprüfe AWS Konfiguration
    const configCheck = {
      region: process.env.AWS_REGION ? 'Configured' : 'Missing',
      accessKey: process.env.AWS_ACCESS_KEY_ID ? 'Configured' : 'Missing',
      secretKey: process.env.AWS_SECRET_ACCESS_KEY ? 'Configured' : 'Missing',
      bucket: process.env.S3_BUCKET_NAME || 'Not configured'
    };
    
    if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.S3_BUCKET_NAME) {
      console.error(`[${requestId}] Presigned URL error: Missing AWS configuration variables`, configCheck);
      return NextResponse.json(
        { 
          error: 'S3 configuration is incomplete. Check environment variables.',
          details: configCheck
        },
        { status: 500 }
      );
    }

    console.log(`[${requestId}] Using AWS Region: ${process.env.AWS_REGION}, Bucket: ${process.env.S3_BUCKET_NAME}`);

    // Eindeutigen Dateinamen generieren
    const uniqueFileName = generateUniqueFileName(fileName);
    console.log(`[${requestId}] Generated unique filename: ${uniqueFileName}`);
    
    // Presigned URL generieren
    try {
      console.time(`[${requestId}] S3 presigned URL generation time`);
      const uploadData = await getPresignedUploadUrl(
        uniqueFileName,
        contentType,
        folder as S3BucketFolder,
        // 5 Minuten gültig, mehr Zeit für große Dateien
        300,
        session.user.id
      );
      console.timeEnd(`[${requestId}] S3 presigned URL generation time`);
      
      console.log(`[${requestId}] Successfully generated presigned URL for S3 path: ${uploadData.key}`);

      // Erstelle Antwort mit CORS-Headers
      const response = NextResponse.json({
        success: true,
        uploadUrl: uploadData.url,
        fileUrl: uploadData.fileUrl,
        key: uploadData.key,
        fileName: uniqueFileName,
        requestId // Für besseres Debugging auf Client-Seite
      });
      
      return response;
    } catch (s3Error) {
      console.error(`[${requestId}] Error generating S3 presigned URL:`, s3Error);
      console.error(`[${requestId}] Error details:`, s3Error instanceof Error ? {
        name: s3Error.name,
        message: s3Error.message,
        stack: s3Error.stack,
      } : String(s3Error));

      // Prüfe auf bekannte AWS Fehlermuster
      let errorMessage = 'Failed to generate S3 upload URL';
      let details = s3Error instanceof Error ? s3Error.message : String(s3Error);
      const statusCode = 500;

      // Überprüfe auf häufige Fehler
      if (details.includes('credentials')) {
        errorMessage = 'AWS Authentication failed';
        details = 'The server cannot authenticate with AWS. Please check credentials.';
      } else if (details.includes('region')) {
        errorMessage = 'AWS Region configuration issue';
        details = 'There is a problem with the AWS region configuration.';
      } else if (details.includes('bucket') || details.includes('Bucket')) {
        errorMessage = 'S3 Bucket access failed';
        details = `The S3 bucket '${process.env.S3_BUCKET_NAME}' may not exist or is not accessible.`;
      } else if (details.includes('timeout') || details.includes('timed out')) {
        errorMessage = 'AWS S3 request timed out';
        details = 'The S3 service did not respond in time. Please try again later.';
      }

      const errorResponse = NextResponse.json(
        { 
          error: errorMessage, 
          details: details,
          timestamp: new Date().toISOString(),
          requestId,
          awsConfig: configCheck
        },
        { status: statusCode }
      );
      
      return errorResponse;
    }
  } catch (error) {
    console.error(`[${requestId}] Error in presigned URL generation:`, error);
    console.error(`[${requestId}] Stack trace:`, error instanceof Error ? error.stack : 'No stack trace');
    
    return NextResponse.json(
      { 
        error: 'Failed to generate upload URL', 
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
        requestId
      },
      { status: 500 }
    );
  }
} 