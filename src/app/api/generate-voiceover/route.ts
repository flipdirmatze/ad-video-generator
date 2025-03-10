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
    // Sichere Authentifizierung
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    if (!ELEVENLABS_API_KEY) {
      return NextResponse.json(
        { error: 'ElevenLabs API key not configured' },
        { status: 500 }
      )
    }

    const { script } = await request.json()

    if (!script) {
      return NextResponse.json(
        { error: 'Script is required' },
        { status: 400 }
      )
    }

    // Voiceover mit ElevenLabs API generieren
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
      const error = await response.json()
      throw new Error(error.message || 'Failed to generate voiceover')
    }

    // Audiodaten als Buffer speichern
    const audioBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(audioBuffer)
    
    // Für temporäre Kompatibilität mit dem Frontend auch base64 zurückgeben
    const audioBase64 = buffer.toString('base64')
    const dataUrl = `data:audio/mpeg;base64,${audioBase64}`
    
    // Eindeutigen Dateinamen generieren und zu S3 hochladen
    const fileName = generateUniqueFileName('voiceover.mp3')
    const s3Url = await uploadToS3(
      buffer,
      fileName, 
      'audio/mpeg',
      'audio' // S3-Bucket-Ordner 'audio' verwenden
    )
    
    // In der Datenbank speichern
    await dbConnect()
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

    // Beide URLs zurückgeben - dataUrl für Frontend-Kompatibilität und s3Url für die Verarbeitung
    return NextResponse.json({
      success: true,
      dataUrl, // Legacy-URL für vorhandene Implementierung
      url: s3Url, // S3-URL für die neue Implementierung
      voiceoverId: voiceover._id,
      fileName
    })
  } catch (error) {
    console.error('Voiceover generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate voiceover', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
} 