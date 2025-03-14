import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSignedDownloadUrl } from '@/lib/storage';

/**
 * GET /api/get-signed-url?key=path/to/file.mp4
 * Generiert eine signierte URL für ein S3-Objekt
 */
export async function GET(request: NextRequest) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // URL-Parameter abrufen
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    
    if (!key) {
      return NextResponse.json({ error: 'Key parameter is required' }, { status: 400 });
    }
    
    // Signierte URL generieren (gültig für 1 Stunde)
    const signedUrl = await getSignedDownloadUrl(key, 3600);
    
    // Erfolg zurückgeben
    return NextResponse.json({
      success: true,
      url: signedUrl,
      key: key,
      expiresIn: 3600
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate signed URL', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 