import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Readable } from 'stream';

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
      const { Body, ContentType, ContentLength } = await s3Client.send(command);
      
      if (!Body) {
        console.error(`Video-Proxy: No body returned for key ${key}`);
        return NextResponse.json({ error: 'Video not found' }, { status: 404 });
      }

      // Stream-Verarbeitung
      const chunks: Uint8Array[] = [];
      if (Body instanceof Readable) {
        for await (const chunk of Body) {
          chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(chunk));
        }
      } else {
        // Handle Blob
        const blob = await Body.transformToByteArray();
        chunks.push(blob);
      }

      // Kombiniere alle Chunks zu einem Buffer
      const buffer = Buffer.concat(chunks);
      
      console.log(`Video-Proxy: Successfully streamed video with key ${key}, size: ${buffer.length} bytes`);
      
      // Erstelle eine Response mit dem Video-Inhalt und den korrekten Headers
      const response = new NextResponse(buffer);
      
      // Setze Content-Type Header
      response.headers.set('Content-Type', ContentType || 'video/mp4');
      
      // Weitere wichtige Headers für Caching und CORS
      response.headers.set('Cache-Control', 'public, max-age=86400');
      response.headers.set('Accept-Ranges', 'bytes');
      
      if (ContentLength) {
        response.headers.set('Content-Length', ContentLength.toString());
      }
      
      return response;
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