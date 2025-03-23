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
      
      // Zwei separate Anfragen - eine für die Audiodaten und eine für die präzisen Zeitstempel
      const [audioResponse, timestampsResponse] = await Promise.all([
        // Standard-Anfrage für Audiodaten
        fetchWithTimeout(
          apiUrl,
          {
            method: 'POST',
            headers: {
              'Accept': 'audio/mpeg',
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
        ),
        
        // Anfrage für präzise Wort-Zeitstempel mit dem with-timestamps Endpunkt
        fetchWithTimeout(
          timestampsUrl,
          {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
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
        )
      ]);

      // Fehlerbehandlung für die Audio-Antwort
      if (!audioResponse.ok) {
        let errorMessage = `ElevenLabs API error: ${audioResponse.status} - ${audioResponse.statusText}`;
        
        try {
          const errorData = await audioResponse.json();
          errorMessage = errorData.message || errorData.detail || errorMessage;
          console.error('ElevenLabs API error:', errorData);
        } catch (parseError) {
          try {
            const errorText = await audioResponse.text();
            errorMessage = errorText || errorMessage;
            console.error('ElevenLabs API error (text):', errorText);
          } catch (textError) {
            console.error('Failed to parse ElevenLabs error response:', textError);
          }
        }
        
        throw new Error(errorMessage);
      }

      // Parse der Antwort für Wort-Zeitstempel mit dem neuen Endpunkt
      let wordTimestamps = [];
      try {
        if (timestampsResponse.ok) {
          const timestampsData = await timestampsResponse.json();
          console.log(`Received timestamps response with data`);
          console.log('Response structure:', Object.keys(timestampsData).join(', '));
          
          // Der with-timestamps Endpunkt gibt ein anderes Format zurück
          if (timestampsData.alignment) {
            // Log first to debug structure
            console.log('Alignment data structure found. Converting to word timestamps...');
            console.log('Sample alignment data:', JSON.stringify(timestampsData.alignment).substring(0, 200) + '...');
            
            // Im Alignment-Objekt haben wir character-level Timestamps
            // Wir müssen diese zu Wort-Timestamps konvertieren
            const characters = timestampsData.alignment.characters || [];
            const startTimes = timestampsData.alignment.character_start_times_seconds || [];
            const endTimes = timestampsData.alignment.character_end_times_seconds || [];
            
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
            }
          } else if (timestampsData.words) {
            // Alternative Struktur, falls die API direkt Wort-Timestamps zurückgibt
            console.log('Word-level timestamps found directly.');
            
            wordTimestamps = timestampsData.words.map((item: any) => ({
              word: item.word,
              startTime: item.start_time,
              endTime: item.end_time
            }));
            
            console.log(`Extracted ${wordTimestamps.length} word timestamps directly from API response`);
          } else {
            console.warn('Unexpected response format from with-timestamps API. No alignment or words property found.');
            console.log('Full response:', JSON.stringify(timestampsData));
          }
        } else {
          console.warn(`Failed to get timestamps response: ${timestampsResponse.status} - ${timestampsResponse.statusText}`);
          // Versuche Fehlermeldung zu lesen
          try {
            const errorData = await timestampsResponse.json();
            console.error('Timestamps API error:', errorData);
          } catch (e) {
            console.error('Could not parse timestamps error response');
          }
        }
      } catch (timestampsError) {
        console.error('Error processing timestamps response:', timestampsError);
        // Wir brechen nicht ab, wenn die Zeitstempel fehlschlagen - wir nutzen dann einfach keine
      }

      console.log(`Voiceover generated successfully from ElevenLabs with voice ID: ${selectedVoiceId}`);
      
      // Audiodaten als Buffer speichern
      const audioBuffer = await audioResponse.arrayBuffer()
      const buffer = Buffer.from(audioBuffer)
      
      console.log(`Audio data received. Size: ${buffer.length} bytes. Using voice ID: ${selectedVoiceId}`);
      
      // Für temporäre Kompatibilität mit dem Frontend auch base64 zurückgeben
      const audioBase64 = buffer.toString('base64')
      const dataUrl = `data:audio/mpeg;base64,${audioBase64}`
      
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