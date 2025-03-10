import { NextRequest, NextResponse } from 'next/server';
import { listFiles, S3BucketFolder, getSignedDownloadUrl } from '@/lib/storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * GET /api/media?folder=uploads&prefix=user1/&limit=20
 * Listet Medien in einem bestimmten S3-Bucket-Folder
 */
export async function GET(request: NextRequest) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Query-Parameter extrahieren
    const searchParams = request.nextUrl.searchParams;
    const folder = searchParams.get('folder') as S3BucketFolder || 'uploads';
    const prefix = searchParams.get('prefix') || '';
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    // Validiere folder-Parameter
    if (!['uploads', 'processed', 'final', 'audio'].includes(folder)) {
      return NextResponse.json(
        { error: 'Invalid folder type' },
        { status: 400 }
      );
    }

    // Medien auflisten
    const files = await listFiles(folder, prefix, limit);

    // Nur für Admins alle Dateien anzeigen, sonst nur eigene
    let filteredFiles = files;
    
    if (session.user.role !== 'admin') {
      const userId = session.user.id;
      // Filtere Dateien basierend auf Benutzer-ID falls diese in Pfad enthalten ist
      // Hinweis: Dies setzt voraus, dass Dateipfade Benutzer-IDs enthalten
      filteredFiles = files.filter(file => {
        return file.key?.includes(`/${userId}/`) || !file.key?.includes('/');
      });
    }

    return NextResponse.json({
      success: true,
      files: filteredFiles
    });
  } catch (error) {
    console.error('Error listing files:', error);
    return NextResponse.json(
      { error: 'Failed to list files' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/media/url
 * Generiert eine signierte URL für einen spezifischen Medienschlüssel
 */
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
    const { key } = data;

    if (!key) {
      return NextResponse.json(
        { error: 'key is required' },
        { status: 400 }
      );
    }

    // Wenn nicht Admin, Zugriff auf fremde Dateien verhindern
    if (session.user.role !== 'admin') {
      if (!key.includes(`/${session.user.id}/`) && key.includes('/')) {
        return NextResponse.json(
          { error: 'Access denied to this resource' },
          { status: 403 }
        );
      }
    }

    // Signierte Download-URL erzeugen
    const signedUrl = await getSignedDownloadUrl(key);

    return NextResponse.json({
      success: true,
      url: signedUrl
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate signed URL' },
      { status: 500 }
    );
  }
} 