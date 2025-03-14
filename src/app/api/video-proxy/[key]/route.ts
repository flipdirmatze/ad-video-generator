import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// Konfiguriere S3 Client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    : undefined
});

const bucketName = process.env.S3_BUCKET_NAME || 'ad-video-generator-bucket';

/**
 * GET /api/video-proxy/[key]
 * Diese API dient als Proxy für S3-Videos und umgeht CORS-Probleme
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { key: string } }
) {
  try {
    // Authentifizierung - Optional, je nach Sicherheitsanforderungen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // S3-Key aus Parametern extrahieren und decodieren
    let key = decodeURIComponent(params.key);
    const originalKey = key;
    
    // Stelle sicher, dass der Key mit 'uploads/' beginnt
    if (!key.startsWith('uploads/')) {
      key = `uploads/${key}`;
    }
    
    console.log(`Video-Proxy: Streaming video from S3 with key: ${key} (original request: ${originalKey})`);

    // Prüfe zunächst, ob das Objekt existiert
    let objectExists = false;
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: bucketName,
        Key: key
      });
      await s3Client.send(headCommand);
      objectExists = true;
      console.log(`Video-Proxy: Object exists with key: ${key}`);
    } catch (headError) {
      console.warn(`Video-Proxy: Object not found with key: ${key}. Error: ${headError instanceof Error ? headError.message : String(headError)}`);
      
      // Wenn es einen Fehler mit dem ursprünglichen Schlüssel gibt, versuche einige alternative Schlüssel
      const alternativeKeys = [
        key,                         // Original mit uploads/ (falls schon gesetzt)
        originalKey,                 // Original ohne Änderungen
        `uploads/${originalKey}`,    // Mit uploads/ präfixiert
        originalKey.replace(/^uploads\//, '') // Ohne uploads/ falls schon präfixiert
      ];
      
      // Spezialfall für numerische Dateinamen wie "1.mp4"
      if (/^\d+\.mp4$/.test(originalKey)) {
        alternativeKeys.push(`uploads/${originalKey}`);
      }
      
      // Versuche alle alternativen Schlüssel
      for (const altKey of alternativeKeys) {
        if (altKey === key) continue; // Überspringen, wenn es der ursprüngliche Schlüssel ist
        
        try {
          const altHeadCommand = new HeadObjectCommand({
            Bucket: bucketName,
            Key: altKey
          });
          await s3Client.send(altHeadCommand);
          key = altKey; // Verwende den funktionierenden Schlüssel
          objectExists = true;
          console.log(`Video-Proxy: Found object with alternative key: ${altKey}`);
          break;
        } catch (altHeadError) {
          console.warn(`Video-Proxy: Alternative key also failed: ${altKey}`);
        }
      }
    }
    
    if (!objectExists) {
      console.error(`Video-Proxy: Could not find object with any key variation of ${originalKey}`);
      return NextResponse.json({ error: 'Video not found in S3' }, { status: 404 });
    }

    // S3 GetObject-Befehl konfigurieren
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    });

    try {
      // Objekt von S3 abrufen
      const s3Response = await s3Client.send(command);
      
      if (!s3Response.Body) {
        console.error(`Video-Proxy: No body returned for key ${key}`);
        return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      }

      // Die Videodate als binäre Daten abrufen - diese Methode ist sehr zuverlässig
      // mit unterschiedlichen Versionen von AWS SDK
      const chunks: Uint8Array[] = [];
      
      // @ts-ignore - handle es als SDKStream
      for await (const chunk of s3Response.Body) {
        chunks.push(chunk);
      }
      
      // Zu einem Uint8Array kombinieren
      const contentLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const allBytes = new Uint8Array(contentLength);
      
      let offset = 0;
      for (const chunk of chunks) {
        allBytes.set(chunk, offset);
        offset += chunk.length;
      }
      
      console.log(`Video-Proxy: Successfully loaded video with key ${key}, size: ${contentLength} bytes`);

      // Erstelle Headers für die Response
      const headers = new Headers();
      if (s3Response.ContentType) {
        headers.set('Content-Type', s3Response.ContentType);
      } else {
        headers.set('Content-Type', 'video/mp4');
      }
      
      headers.set('Cache-Control', 'public, max-age=86400');
      headers.set('Accept-Ranges', 'bytes');
      
      if (contentLength) {
        headers.set('Content-Length', contentLength.toString());
      }
      
      // Erstelle eine standardkonforme Response mit den kompletten Daten
      return new Response(allBytes, {
        headers
      });
    } catch (error) {
      console.error(`Video-Proxy: Error fetching from S3: ${error instanceof Error ? error.message : String(error)}`);
      return NextResponse.json(
        { error: 'Failed to retrieve video', details: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error(`Video-Proxy: Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json(
      { error: 'Error processing request', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 