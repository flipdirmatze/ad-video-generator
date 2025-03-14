import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { uploadToS3, generateUniqueFileName } from '@/lib/storage'
import dbConnect from '@/lib/mongoose'
import Voiceover from '@/models/Voiceover'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Example voice ID, you can change this

export async function POST(request: Request) {
  try {
    console.log('Starting voiceover generation process');
    
    // Sichere Authentifizierung
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      console.error('Voiceover generation error: Unauthorized - No session or user ID');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    if (!ELEVENLABS_API_KEY) {
      console.error('Voiceover generation error: ElevenLabs API key not configured');
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured in environment variables' },
        { status: 500 }
      )
    }

    const { script } = await request.json()

    if (!script) {
      console.error('Voiceover generation error: Script is required');
      return NextResponse.json(
        { error: 'Script is required' },
        { status: 400 }
      )
    }

    console.log(`Generating voiceover with ElevenLabs API. Script length: ${script.length} characters`);
    
    // Voiceover mit ElevenLabs API generieren
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
        {
          method: 'POST',
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': ELEVENLABS_API_KEY
          },
          body: JSON.stringify({
            text: script,
            model_id: 'eleven_monolingual_v1',
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75
            }
          })
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Unknown ElevenLabs API error' }));
        console.error('ElevenLabs API error:', errorData);
        throw new Error(errorData.message || `ElevenLabs API error: ${response.status} - ${response.statusText}`);
      }

      console.log('Voiceover generated successfully from ElevenLabs');
      
      // Audiodaten als Buffer speichern
      const audioBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(audioBuffer)
      
      console.log(`Audio data received. Size: ${buffer.length} bytes`);
      
      // Für temporäre Kompatibilität mit dem Frontend auch base64 zurückgeben
      const audioBase64 = buffer.toString('base64')
      const dataUrl = `data:audio/mpeg;base64,${audioBase64}`
      
      // Eindeutigen Dateinamen generieren und zu S3 hochladen
      const fileName = generateUniqueFileName('voiceover.mp3')
      console.log(`Uploading voiceover to S3 with filename: ${fileName}`);
      
      try {
        const s3Url = await uploadToS3(
          buffer,
          fileName, 
          'audio/mpeg',
          'audio' // S3-Bucket-Ordner 'audio' verwenden
        )
        
        console.log(`Voiceover uploaded to S3 successfully. URL: ${s3Url}`);
        
        // In der Datenbank speichern
        console.log('Connecting to MongoDB to save voiceover metadata');
        await dbConnect()
        
        try {
          const voiceover = await Voiceover.create({
            userId: session.user.id,
            name: fileName,
            text: script,
            url: s3Url,
            path: `audio/${fileName}`,
            size: buffer.length,
            isPublic: false,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          
          console.log(`Voiceover metadata saved to MongoDB. ID: ${voiceover._id}`);
          
          // Beide URLs zurückgeben - dataUrl für Frontend-Kompatibilität und s3Url für die Verarbeitung
          return NextResponse.json({
            success: true,
            dataUrl, // Legacy-URL für vorhandene Implementierung
            url: s3Url, // S3-URL für die neue Implementierung
            voiceoverId: voiceover._id,
            fileName
          })
        } catch (dbError) {
          console.error('MongoDB error when saving voiceover:', dbError);
          // Auch wenn der DB-Eintrag fehlschlägt, können wir die Voiceover-Datei zurückgeben
          return NextResponse.json({
            success: true,
            dataUrl,
            url: s3Url,
            fileName,
            warning: 'Voiceover generated but metadata could not be saved to database'
          })
        }
      } catch (s3Error) {
        console.error('S3 upload error:', s3Error);
        // Fallback: Bei S3-Fehler zumindest die Base64-Daten zurückgeben
        return NextResponse.json({
          success: true,
          dataUrl,
          warning: 'Voiceover generated but could not be uploaded to S3',
          fileName: 'voiceover.mp3'
        })
      }
    } catch (apiError) {
      console.error('ElevenLabs API request error:', apiError);
      throw new Error(`Failed to generate voiceover with ElevenLabs: ${apiError instanceof Error ? apiError.message : String(apiError)}`);
    }
  } catch (error) {
    console.error('Voiceover generation error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to generate voiceover', 
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
} 