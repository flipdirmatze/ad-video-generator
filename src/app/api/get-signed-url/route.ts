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
    // Get session to identify user
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the key from the query parameters
    const key = request.nextUrl.searchParams.get('key');
    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    // Generate a signed URL that is valid for 24 hours
    const signedUrl = await getSignedDownloadUrl(key, 86400);

    return NextResponse.json({ 
      success: true, 
      url: signedUrl 
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate signed URL', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 