import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getSignedDownloadUrl, getS3Url } from '@/lib/storage';

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

    console.log(`Attempting to generate signed URL for key: ${key}`);
    
    // Versuche, direkten S3-URL zu generieren (für Debugging)
    const directS3Url = getS3Url(key);
    console.log(`Direct S3 URL (fallback): ${directS3Url}`);
    
    try {
      // Signierte URL generieren (gültig für 12 Stunden - erhöhte Zeit für Debugging)
      const signedUrl = await getSignedDownloadUrl(key, 43200);
      console.log(`Successfully generated signed URL for ${key}`);
      
      // Erfolg zurückgeben
      return NextResponse.json({
        success: true,
        url: signedUrl,
        key: key,
        directUrl: directS3Url, // Für Debugging
        expiresIn: 43200 // 12 Stunden
      });
    } catch (signedUrlError) {
      console.error(`Error generating signed URL for key ${key}:`, signedUrlError);
      
      // Fallback zum direkten S3-URL (könnte funktionieren, wenn der Bucket öffentlich ist)
      return NextResponse.json({
        success: true,
        url: directS3Url,
        key: key,
        usedFallback: true,
        error: signedUrlError instanceof Error ? signedUrlError.message : String(signedUrlError)
      });
    }
  } catch (error) {
    console.error('Error in get-signed-url API route:', error);
    return NextResponse.json(
      { 
        error: 'Failed to generate signed URL', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 