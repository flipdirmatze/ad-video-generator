import { NextRequest, NextResponse } from 'next/server';
import { getPresignedUploadUrl, generateUniqueFileName, S3BucketFolder } from '@/lib/storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Request-Body-Daten parsen
    const data = await request.json();
    const { fileName, contentType, folder = 'uploads' } = data;

    if (!fileName || !contentType) {
      return NextResponse.json(
        { error: 'fileName and contentType are required' },
        { status: 400 }
      );
    }

    // Validiere Folder-Typ
    if (!['uploads', 'processed', 'final', 'audio'].includes(folder)) {
      return NextResponse.json(
        { error: 'Invalid folder type' },
        { status: 400 }
      );
    }

    // Eindeutigen Dateinamen generieren
    const uniqueFileName = generateUniqueFileName(fileName);
    
    // Presigned URL generieren
    const uploadData = await getPresignedUploadUrl(
      uniqueFileName,
      contentType,
      folder as S3BucketFolder,
      // 5 Minuten gültig, mehr Zeit für große Dateien
      300
    );

    // Erfolgreich zurückgeben
    return NextResponse.json({
      success: true,
      uploadUrl: uploadData.url,
      fileUrl: uploadData.fileUrl,
      key: uploadData.key,
      fileName: uniqueFileName
    });
  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
} 