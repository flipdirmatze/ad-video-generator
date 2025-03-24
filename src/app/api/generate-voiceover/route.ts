import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { uploadToS3, generateUniqueFileName } from '@/lib/storage'
import dbConnect from '@/lib/mongoose'
import Voiceover from '@/models/Voiceover'
import { Types } from 'mongoose'

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
const DEFAULT_VOICE_ID = 'pNInz6obpgDQGcFmaJgB' // Standard-Stimme als Fallback

// Längeres Timeout für große Texte (3 Minuten)
const FETCH_TIMEOUT_MS = 180000;

// Maximale Textlänge, um Timeouts zu vermeiden
const MAX_TEXT_LENGTH = 3000; // 3000 Zeichen ist ein vernünftiges Limit für Vercel Pro (60s)

// Hilfsfunktion für Fetch mit Timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number) {
  const controller = new AbortController();
  const { signal } = controller;
  
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      // Klare Nachricht für Timeout-Fehler
      throw new Error('Die Anfrage hat das Zeitlimit überschritten. Bitte versuche es mit einem kürzeren Text.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

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

    const { script, voiceId, isTest } = await request.json()

    // Verwende die übergebene Stimme oder die Standard-Stimme
    const selectedVoiceId = voiceId || DEFAULT_VOICE_ID;
    
    console.log(`Using voice ID for generation: ${selectedVoiceId} ${isTest ? '(test mode)' : ''}`);

    if (!script) {
      console.error('Voiceover generation error: Script is required');
      return NextResponse.json(
        { error: 'Script is required' },
        { status: 400 }
      )
    }

    const scriptLength = script.length;
    console.log(`Generating voiceover with ElevenLabs API. Script length: ${scriptLength} characters. Voice ID: ${selectedVoiceId}`);
    
    // Prüfe Textlänge und weise ab, wenn zu lang
    if (scriptLength > MAX_TEXT_LENGTH) {
      console.error(`Text too long: ${scriptLength} characters (maximum: ${MAX_TEXT_LENGTH})`);
      return NextResponse.json(
        { 
          error: `Der Text ist zu lang (${scriptLength} Zeichen). Bitte kürze den Text auf maximal ${MAX_TEXT_LENGTH} Zeichen.`,
          details: 'Die Verarbeitung langer Texte kann zu Timeouts führen.'
        },
        { status: 413 } // 413 = Payload Too Large
      );
    }
    
    // Warnung bei sehr langen Texten ausgeben
    if (scriptLength > 2000) {
      console.warn(`WARNING: Processing long text (${scriptLength} characters). This might take a while.`);
    }
    
    // Voiceover mit ElevenLabs API generieren
    try {
      const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`;
      console.log(`Calling ElevenLabs API at: ${apiUrl} with timeout of ${FETCH_TIMEOUT_MS/1000} seconds`);
      
      // Erweitern Sie das Timeout basierend auf der Textlänge, aber begrenzt auf Vercel Pro Limit (55s)
      const dynamicTimeout = Math.min(55000, 30000 + (scriptLength * 10)); // Basiswert + 10ms pro Zeichen
      console.log(`Using dynamic timeout of ${dynamicTimeout/1000} seconds based on text length`);
      
      // Verwende die neue with-timestamps API für präzisere Wort-Zeitstempel
      const timestampsUrl = `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}/with-timestamps`;
      console.log(`Calling ElevenLabs with-timestamps API for precise word timestamps at: ${timestampsUrl}`);
      
      // Mit der with-timestamps API bekommen wir in einem Request sowohl Audio-Daten UND Timestamps
      let timestampsResponse;
      try {
        timestampsResponse = await fetchWithTimeout(
          timestampsUrl,
          {
            method: 'POST',
            headers: {
              'Accept': 'application/json', // Wichtig: application/json, nicht audio/mpeg
              'Content-Type': 'application/json',
              'xi-api-key': ELEVENLABS_API_KEY
            },
            body: JSON.stringify({
              text: script,
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                stability: 0.35,
                similarity_boost: 0.85,
                style: 0.20,
                use_speaker_boost: true
              }
            })
          },
          dynamicTimeout
        );
      } catch (timeoutError) {
        console.error('Request timed out:', timeoutError);
        throw new Error('Die Anfrage hat das Zeitlimit überschritten. Bitte versuche es mit einem kürzeren Text.');
      }

      // Fehlerbehandlung für die Antwort
      if (!timestampsResponse.ok) {
        let errorMessage = `ElevenLabs API error: ${timestampsResponse.status} - ${timestampsResponse.statusText}`;
        
        try {
          const errorData = await timestampsResponse.json();
          errorMessage = errorData.message || errorData.detail || errorMessage;
          console.error('ElevenLabs API error:', errorData);
        } catch (parseError) {
          try {
            const errorText = await timestampsResponse.text();
            errorMessage = errorText || errorMessage;
            console.error('ElevenLabs API error (text):', errorText);
          } catch (textError) {
            console.error('Failed to parse ElevenLabs error response:', textError);
          }
        }
        
        throw new Error(errorMessage);
      }

      // Parse der Antwort für Audio-Daten und Wort-Zeitstempel
      let wordTimestamps = [];
      let audioBase64;
      try {
        const responseData = await timestampsResponse.json();
        console.log(`Received with-timestamps response with data`);
        console.log('Response structure:', Object.keys(responseData).join(', '));
        
        // *** DEBUG LOGGING - VOLLE RESPONSE ***
        console.log('RAW RESPONSE SAMPLE (first 2000 chars):');
        console.log(JSON.stringify(responseData).substring(0, 2000));
        console.log('END OF RAW RESPONSE SAMPLE');
        
        // Die Audio-Daten kommen als Base64 in der JSON-Antwort
        if (responseData.audio_base64) {
          console.log('Found audio_base64 in response');
          audioBase64 = responseData.audio_base64;
        } else {
          throw new Error('No audio data found in with-timestamps response');
        }
        
        // DEBUGAUSGABE: Vollständige Antwortstruktur
        console.log('Response structure sample:', 
          JSON.stringify(responseData).substring(0, 500) + '...');
          
        // Der with-timestamps Endpunkt gibt normalized_alignment und alignment zurück
        // Wir verwenden bevorzugt normalized_alignment
        const alignmentData = responseData.normalized_alignment || responseData.alignment;
        
        if (alignmentData) {
          // Log first to debug structure
          console.log('*** FULL ALIGNMENT DATA STRUCTURE: ***');
          console.log(JSON.stringify(alignmentData, null, 2).substring(0, 1000) + '...');
          
          // Im Alignment-Objekt haben wir character-level Timestamps
          // Wir müssen diese zu Wort-Timestamps konvertieren
          const characters = alignmentData.characters || [];
          const startTimes = alignmentData.character_start_times_seconds || [];
          const endTimes = alignmentData.character_end_times_seconds || [];
          
          console.log(`Character-level timestamps found: ${characters.length} characters`);
          
          // Konvertiere Zeichen-Level zu Wort-Level Timestamps
          if (characters.length > 0 && characters.length === startTimes.length && characters.length === endTimes.length) {
            // Gruppieren wir die Zeichen zu Wörtern
            let currentWord = '';
            let wordStart = 0;
            let wordEnd = 0;
            let inWord = false;
            
            for (let i = 0; i < characters.length; i++) {
              const char = characters[i];
              const startTime = startTimes[i];
              const endTime = endTimes[i];
              
              // Überspringe Leerzeichen zwischen Wörtern
              if (char.trim() === '') {
                if (inWord) {
                  // Wort endet
                  wordTimestamps.push({
                    word: currentWord,
                    startTime: wordStart,
                    endTime: wordEnd
                  });
                  
                  // Zurücksetzen
                  currentWord = '';
                  inWord = false;
                }
                continue;
              }
              
              // Beginn eines neuen Wortes
              if (!inWord) {
                inWord = true;
                wordStart = startTime;
              }
              
              // Füge Buchstaben zum Wort hinzu
              currentWord += char;
              wordEnd = endTime;
            }
            
            // Das letzte Wort, falls vorhanden
            if (inWord && currentWord) {
              wordTimestamps.push({
                word: currentWord,
                startTime: wordStart,
                endTime: wordEnd
              });
            }
            
            console.log(`Extracted ${wordTimestamps.length} word timestamps from character-level alignment`);
            console.log('First few timestamps:', wordTimestamps.slice(0, 3));
          }
        } else {
          console.warn('No alignment data found in response');
        }
      } catch (parseError) {
        console.error('Error processing timestamps response:', parseError);
        // Wir brechen nicht ab, wenn die Zeitstempel fehlschlagen - wir nutzen dann einfach keine
      }

      console.log(`Voiceover generated successfully from ElevenLabs with voice ID: ${selectedVoiceId}`);
      
      // Audiodaten als Buffer speichern
      const buffer = Buffer.from(audioBase64, 'base64');
      
      console.log(`Audio data received. Size: ${buffer.length} bytes. Using voice ID: ${selectedVoiceId}`);
      
      // Für temporäre Kompatibilität mit dem Frontend auch base64 zurückgeben
      const dataUrl = `data:audio/mpeg;base64,${audioBase64}`;
      
      // Für Stimmentests sofort die Daten zurückgeben ohne S3-Upload oder DB-Eintrag
      if (isTest) {
        console.log(`Test mode - returning data URL only. Voice ID: ${selectedVoiceId}`);
        return NextResponse.json({
          success: true,
          dataUrl,
          voiceId: selectedVoiceId,
          wordTimestamps: wordTimestamps.length > 0 ? wordTimestamps : undefined
        });
      }
      
      // Connect to database first to generate MongoDB ID
      console.log('Connecting to MongoDB to prepare voiceover document');
      await dbConnect();
      
      // Generate a MongoDB ObjectId first
      const voiceoverId = new Types.ObjectId();
      
      // Use the MongoDB ID as the filename
      const fileName = `${voiceoverId.toString()}.mp3`;
      console.log(`Using MongoDB ID as filename: ${fileName} for voice ID: ${selectedVoiceId}`);
      
      // Upload to S3 with the MongoDB ID as the filename
      console.log(`Uploading voiceover to S3 with filename: ${fileName}`);
      
      try {
        const s3Url = await uploadToS3(
          buffer,
          fileName, 
          'audio/mpeg',
          'audio' // S3-Bucket-Ordner 'audio' verwenden
        )
        
        console.log(`Voiceover uploaded to S3 successfully. URL: ${s3Url}`);
        
        try {
          // Create the voiceover document with the pre-generated ID
          const voiceover = await Voiceover.create({
            _id: voiceoverId, // Use the pre-generated ID
            userId: session.user.id,
            name: fileName,
            text: script,
            url: s3Url,
            path: `audio/${fileName}`,
            size: buffer.length,
            voiceId: selectedVoiceId, // Speichere die verwendete Stimmen-ID
            isPublic: false,
            wordTimestamps: wordTimestamps.length > 0 ? wordTimestamps : undefined,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          
          console.log(`Voiceover metadata saved to MongoDB. ID: ${voiceover._id}. Word timestamps count: ${wordTimestamps.length}`);
          
          // CRITICAL TEST: Check if timestamps were properly saved to MongoDB
          try {
            const savedVoiceover = await Voiceover.findById(voiceoverId).lean();
            console.log('CRITICAL TEST - Retrieved voiceover from DB:');
            if (savedVoiceover) {
              console.log('- Has wordTimestamps field:', !!(savedVoiceover as any).wordTimestamps);
              console.log('- wordTimestamps is array:', Array.isArray((savedVoiceover as any).wordTimestamps));
              console.log('- wordTimestamps length:', (savedVoiceover as any).wordTimestamps ? (savedVoiceover as any).wordTimestamps.length : 0);
              if ((savedVoiceover as any).wordTimestamps && (savedVoiceover as any).wordTimestamps.length > 0) {
                console.log('- First timestamp:', JSON.stringify((savedVoiceover as any).wordTimestamps[0]));
              }
            } else {
              console.log('CRITICAL TEST - No voiceover found in database!');
            }
          } catch (testError) {
            console.error('CRITICAL TEST ERROR:', testError);
          }
          
          // Beide URLs zurückgeben - dataUrl für Frontend-Kompatibilität und s3Url für die Verarbeitung
          return NextResponse.json({
            success: true,
            dataUrl, // Legacy-URL für vorhandene Implementierung
            url: s3Url, // S3-URL für die neue Implementierung
            voiceoverId: voiceover._id,
            voiceId: selectedVoiceId, // Gib die verwendete Stimmen-ID zurück
            fileName,
            wordTimestampsCount: wordTimestamps.length
          })
        } catch (dbError) {
          console.error('MongoDB error when saving voiceover:', dbError);
          // Auch wenn der DB-Eintrag fehlschlägt, können wir die Voiceover-Datei zurückgeben
          return NextResponse.json({
            success: true,
            dataUrl,
            url: s3Url,
            fileName,
            voiceId: selectedVoiceId, // Gib die verwendete Stimmen-ID zurück
            voiceoverId: voiceoverId.toString(),
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
          voiceId: selectedVoiceId, // Gib die verwendete Stimmen-ID zurück
          fileName: 'voiceover.mp3'
        })
      }
    } catch (apiError) {
      console.error('ElevenLabs API request error:', apiError);
      
      // Prüfe auf Timeout-Fehler
      const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
      if (errorMessage.includes('abort') || errorMessage.includes('timeout') || errorMessage.includes('Zeitlimit')) {
        return NextResponse.json(
          { 
            error: 'Die Generierung des Voiceovers hat zu lange gedauert. Bitte versuche es mit einem kürzeren Text.',
            details: `API request timed out after ${FETCH_TIMEOUT_MS / 1000} seconds. Text length: ${scriptLength} characters.`,
            timestamp: new Date().toISOString()
          },
          { status: 504 }
        );
      }
      
      throw new Error(`Failed to generate voiceover with ElevenLabs: ${errorMessage}`);
    }
  } catch (error) {
    console.error('Voiceover generation error:', error);
    
    // Verbesserte Fehlermeldung für Frontend
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return NextResponse.json(
      { 
        error: errorMessage.startsWith('Failed to generate') 
          ? errorMessage 
          : `Fehler bei der Voiceover-Generierung: ${errorMessage}`,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
} 