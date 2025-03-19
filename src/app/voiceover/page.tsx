'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { SpeakerWaveIcon, PlayIcon, PauseIcon, ArrowRightIcon, TrashIcon, ArrowDownTrayIcon, PaperAirplaneIcon, PlusIcon, CheckIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'

// ElevenLabs Stimmen Konfiguration - Deutsche Stimmen
const ELEVENLABS_VOICES = [
  { id: 'yuDdr3w2HUqhAD3wqxRt', name: 'Samer', description: 'Schnelle männliche Stimme' },
  { id: 'piTKgcLEGmPE4e6mEKli', name: 'Nicole', description: 'Freundliche weibliche Stimme' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', description: 'Sachliche männliche Stimme' },
  { id: '29vD33N1CtxCmqQRPOHJ', name: 'Sarah', description: 'Professionelle weibliche Stimme' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Thomas', description: 'Tiefe männliche Stimme' }
];

// Beispielsatz für den Stimmentest
const TEST_SENTENCE = "Hallo, so klingt meine Stimme";

type VoiceoverData = {
  dataUrl: string; // Base64-URL für Browser-Vorschau
  url: string; // S3-URL für dauerhafte Speicherung
  voiceoverId: string;
  fileName: string;
};

export default function VoiceoverPage() {
  // State-Hooks
  const { data: session, status } = useSession()
  const router = useRouter()
  const [script, setScript] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [voiceoverData, setVoiceoverData] = useState<VoiceoverData | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState(ELEVENLABS_VOICES[0].id)
  const [isTestingVoice, setIsTestingVoice] = useState(false)
  const [testAudio, setTestAudio] = useState<HTMLAudioElement | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Authentifizierungsprüfung
  useEffect(() => {
    if (!isLoading && status !== 'loading') {
      if (status !== 'authenticated') {
        router.push('/auth/signin?callbackUrl=/voiceover')
      }
    }
    setIsLoading(false)
  }, [status, isLoading, router])

  // Gespeicherte Voiceover-Daten laden
  useEffect(() => {
    const loadSavedData = async () => {
      // Projekt-ID aus localStorage laden
      const savedProjectId = localStorage.getItem('currentProjectId');
      if (savedProjectId) {
        setProjectId(savedProjectId);
        
        // Projekt-Daten vom Server laden
        try {
          const response = await fetch(`/api/workflow-state?projectId=${savedProjectId}`);
          if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.project) {
              // Wenn das Projekt ein Voiceover hat, Voiceover-Daten laden
              if (data.project.voiceoverId && data.project.voiceoverUrl) {
                setVoiceoverData({
                  dataUrl: data.project.voiceoverUrl,
                  url: data.project.voiceoverUrl,
                  voiceoverId: data.project.voiceoverId,
                  fileName: 'voiceover.mp3'
                });
              }
              
              // Wenn das Projekt ein Voiceover-Script hat, Script laden
              if (data.project.voiceoverScript && script === '') {
                setScript(data.project.voiceoverScript);
              }
              
              // Wenn das Projekt eine ausgewählte Stimme hat, Stimme laden
              if (data.project.voiceId) {
                console.log('Setting voice from project:', data.project.voiceId);
                setSelectedVoice(data.project.voiceId);
              }
            }
          }
        } catch (error) {
          console.error('Error loading project data:', error);
        }
      }
      
      // Legacy-Daten aus localStorage laden
      const savedVoiceoverData = localStorage.getItem('voiceoverData');
      if (savedVoiceoverData) {
        try {
          const parsedData = JSON.parse(savedVoiceoverData);
          setVoiceoverData(parsedData);
          
          // Gespeicherte Stimmen-ID abrufen
          if (parsedData.voiceId) {
            console.log('Setting voice from localStorage parsedData:', parsedData.voiceId);
            setSelectedVoice(parsedData.voiceId);
          }
        } catch (error) {
          console.error('Error parsing saved voiceover data:', error);
          
          // Fallback für ältere Version
          const savedVoiceover = localStorage.getItem('voiceoverUrl');
          if (savedVoiceover) {
            setVoiceoverData({
              dataUrl: savedVoiceover,
              url: savedVoiceover,
              voiceoverId: 'legacy',
              fileName: 'voiceover.mp3'
            });
          }
        }
        
        // Lade gespeichertes Skript nur wenn das aktuelle Script leer ist
        const savedScript = localStorage.getItem('voiceoverScript');
        if (savedScript && script === '') {
          setScript(savedScript);
        }
        
        // Lade gespeicherte Stimmen-ID
        const savedVoiceId = localStorage.getItem('selectedVoiceId');
        if (savedVoiceId) {
          console.log('Setting voice from localStorage selectedVoiceId:', savedVoiceId);
          setSelectedVoice(savedVoiceId);
        }
      }
    };
    
    loadSavedData();
  }, []); // script aus den Dependencies entfernt

  // Audio-Wiedergabe steuern
  const togglePlay = useCallback(() => {
    if (!voiceoverData) return;

    // Die dataUrl für die Browser-Wiedergabe verwenden
    const audioUrl = voiceoverData.dataUrl;

    if (!audioElement) {
      console.log('Creating new audio element with URL:', audioUrl);
      const audio = new Audio(audioUrl)
      audio.addEventListener('ended', () => setIsPlaying(false))
      audio.addEventListener('loadedmetadata', () => {
        setDuration(audio.duration);
      })
      
      // Aktualisiere die Zeit alle 100ms
      const updateProgress = () => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        
        progressIntervalRef.current = setInterval(() => {
          if (audio) {
            setCurrentTime(audio.currentTime);
          }
        }, 100);
      };
      
      audio.addEventListener('play', updateProgress);
      audio.addEventListener('ended', () => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      });
      
      audioRef.current = audio;
      setAudioElement(audio)
      audio.play()
      setIsPlaying(true)
    } else {
      if (isPlaying) {
        audioElement.pause()
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      } else {
        audioElement.play()
        // Aktualisiere die Zeit alle 100ms
        progressIntervalRef.current = setInterval(() => {
          if (audioElement) {
            setCurrentTime(audioElement.currentTime);
          }
        }, 100);
      }
      setIsPlaying(!isPlaying)
    }
  }, [voiceoverData, audioElement, isPlaying]);

  const handleReset = () => {
    if (audioElement) {
      audioElement.pause();
      setAudioElement(null);
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    setVoiceoverData(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    localStorage.removeItem('voiceoverData');
    localStorage.removeItem('voiceoverUrl'); // Legacy-Eintrag auch entfernen
    localStorage.removeItem('voiceoverScript');
    // Stimmenauswahl beibehalten
  };

  // Handle voice selection change
  const handleVoiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const voiceId = e.target.value;
    console.log('Voice changed to:', voiceId);
    setSelectedVoice(voiceId);
    localStorage.setItem('selectedVoiceId', voiceId);
  };

  // Testen der ausgewählten Stimme
  const handleTestVoice = async () => {
    try {
      setIsTestingVoice(true);
      
      // API-Aufruf zum Testen der Stimme mit einem Testsatz
      const response = await fetch('/api/generate-voiceover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          script: TEST_SENTENCE,
          voiceId: selectedVoice,
          isTest: true, // Markiere dies als Test, damit die API keine DB-Einträge oder S3-Uploads erstellt
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to test voice');
      }

      const data = await response.json();
      
      // Wenn wir bereits ein Audio-Element haben, stoppen und entfernen wir es
      if (testAudio) {
        testAudio.pause();
        testAudio.remove();
      }

      // Erstelle ein neues Audio-Element und spiele den Testsatz ab
      const audio = new Audio(data.dataUrl);
      setTestAudio(audio);
      audio.play();

    } catch (error) {
      console.error('Error testing voice:', error);
      toast.error('Failed to test voice. Please try again.');
    } finally {
      setIsTestingVoice(false);
    }
  };

  // Voiceover-Generierung
  const handleGenerateVoiceover = async () => {
    if (!script.trim()) return
    
    setIsGenerating(true)
    setError(null)
    
    // Sicherstellen, dass die aktuelle Stimme verwendet wird
    const currentVoiceId = selectedVoice;
    console.log('Generating voiceover with voice ID (current selection):', currentVoiceId);
    
    // Prüfe die Länge des Textes und zeige eine Warnung an, wenn er sehr lang ist
    if (script.length > 5000) {
      console.warn(`Generating voiceover for long text (${script.length} characters). This might take a while.`);
      toast('Der Text ist sehr lang. Die Generierung kann einige Zeit dauern...', {
        duration: 5000,
      });
    }
    
    try {
      const requestBody = {
        script, 
        voiceId: currentVoiceId // Verwende die aktuell ausgewählte Stimme
      };
      
      console.log('Request body for API call:', JSON.stringify(requestBody));
      
      const response = await fetch('/api/generate-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate voiceover')
      }
      
      console.log('Received data from API, voice used:', data.voiceId);
      
      // Neue Datenstruktur mit allen relevanten Informationen
      const newVoiceoverData: VoiceoverData = {
        dataUrl: data.dataUrl || data.url, // Fallback für Kompatibilität
        url: data.url,
        voiceoverId: data.voiceoverId || 'local',
        fileName: data.fileName || 'voiceover.mp3'
      };
      
      // Bestehenden Audioplayer zurücksetzen
      if (audioElement) {
        audioElement.pause();
        setAudioElement(null);
        setIsPlaying(false);
      }
      
      setVoiceoverData(newVoiceoverData);
      
      // Bei jeder Generierung die aktuelle Stimmen-ID speichern
      localStorage.setItem('selectedVoiceId', currentVoiceId);
      
      // Als JSON in localStorage speichern mit Stimmen-ID
      const voiceoverDataWithVoice = {
        ...newVoiceoverData,
        voiceId: currentVoiceId
      };
      localStorage.setItem('voiceoverData', JSON.stringify(voiceoverDataWithVoice));
      // Auch das Script speichern
      localStorage.setItem('voiceoverScript', script);
      
      // Workflow-Status speichern mit der aktuellen Stimmen-ID
      await saveWorkflowState(data.voiceoverId, script, currentVoiceId);
      
      // Automatisch abspielen nach der Generierung
      const newAudio = new Audio(newVoiceoverData.dataUrl);
      newAudio.addEventListener('ended', () => setIsPlaying(false));
      setAudioElement(newAudio);
      newAudio.play();
      setIsPlaying(true);
      console.log('Autoplay started for newly generated voiceover');
    } catch (error) {
      console.error('Failed to generate voiceover:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate voiceover')
    } finally {
      setIsGenerating(false)
    }
  }
  
  // Workflow-Status speichern
  const saveWorkflowState = async (voiceoverId: string, voiceoverScript: string, voiceId = selectedVoice) => {
    setIsSaving(true);
    
    try {
      const response = await fetch('/api/workflow-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId,
          workflowStep: 'voiceover',
          voiceoverId: voiceoverId,
          voiceoverScript: voiceoverScript,
          voiceId: voiceId,
          title: 'Mein Video-Projekt'
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save workflow state');
      }
      
      const data = await response.json();
      
      // Projekt-ID aktualisieren
      if (data.projectId) {
        setProjectId(data.projectId);
        localStorage.setItem('currentProjectId', data.projectId);
      }
    } catch (error) {
      console.error('Error saving workflow state:', error);
      // Kein UI-Fehler anzeigen, da dies ein Hintergrundprozess ist
    } finally {
      setIsSaving(false);
    }
  };

  // Lädt den nächsten Schritt im Workflow
  const handleContinue = () => {
    router.push('/upload')
  }

  const handleDownload = () => {
    if (!voiceoverData) return
    
    const link = document.createElement('a')
    link.href = voiceoverData.dataUrl
    link.download = 'voiceover.mp3'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Format time as mm:ss
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // Handle progress bar click
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioElement || !voiceoverData) return;
    
    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const clickPositionRatio = (e.clientX - rect.left) / rect.width;
    const newTime = clickPositionRatio * duration;
    
    audioElement.currentTime = newTime;
    setCurrentTime(newTime);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <main className="min-h-screen">
      <div className="container mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Generate a Voiceover
          </h1>
          <p className="mt-4 text-lg text-white/60">
            Write your script below and generate a professional voiceover using AI.
            This voiceover will be used for your video.
          </p>

          <div className="mt-8">
            <label htmlFor="script" className="block text-sm font-medium text-white/80">
              Script
            </label>
            <div className="mt-1">
              <textarea
                id="script"
                name="script"
                rows={6}
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-700 bg-gray-800 text-white rounded-md p-4"
                placeholder="Gib hier dein Skript ein..."
                value={script}
                onChange={(e) => setScript(e.target.value)}
              />
            </div>
            
            {/* Voice Selection Dropdown */}
            <div className="mt-4">
              <label htmlFor="voice" className="block text-sm font-medium text-white/80">
                Stimme auswählen
              </label>
              <div className="flex mt-1 gap-2">
                <select
                  id="voice"
                  name="voice"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 flex-grow sm:text-sm border-gray-700 bg-gray-800 text-white rounded-md p-2.5"
                  value={selectedVoice}
                  onChange={handleVoiceChange}
                >
                  {ELEVENLABS_VOICES.map(voice => (
                    <option key={voice.id} value={voice.id}>
                      {voice.name} - {voice.description}
                    </option>
                  ))}
                </select>
                
                {/* Test Voice Button */}
                <button
                  onClick={handleTestVoice}
                  disabled={isTestingVoice}
                  className="shadow-sm inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {isTestingVoice ? (
                    <SpeakerWaveIcon className="h-4 w-4 animate-pulse" />
                  ) : (
                    <>
                      <SpeakerWaveIcon className="h-4 w-4 mr-1" />
                      Testen
                    </>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-900/20 border border-red-500/30 text-red-400 rounded-md">
                {error}
              </div>
            )}

            {/* Generate Button section */}
            <div className="mt-6">
              {!voiceoverData && (
                <button
                  onClick={handleGenerateVoiceover}
                  disabled={isGenerating || !script.trim()}
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <>
                      <SpeakerWaveIcon className="h-5 w-5 mr-2 animate-pulse" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <SpeakerWaveIcon className="h-5 w-5 mr-2" />
                      Generate Voiceover
                    </>
                  )}
                </button>
              )}

              {voiceoverData && (
                <div className="space-y-4">
                  <div className="bg-gray-800 p-4 rounded-md">
                    <div className="flex justify-between items-center">
                      <h2 className="text-lg font-medium">Dein Voiceover</h2>
                      <div className="flex space-x-2">
                        <button
                          onClick={togglePlay}
                          className="inline-flex items-center justify-center p-2 border border-transparent rounded-full text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          {isPlaying ? (
                            <PauseIcon className="h-5 w-5" />
                          ) : (
                            <PlayIcon className="h-5 w-5" />
                          )}
                        </button>
                        <button
                          onClick={handleDownload}
                          className="inline-flex items-center justify-center p-2 border border-transparent rounded-full text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                        >
                          <ArrowDownTrayIcon className="h-5 w-5" />
                        </button>
                        <button
                          onClick={handleReset}
                          className="inline-flex items-center justify-center p-2 border border-transparent rounded-full text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    
                    {/* Audio Player mit Progress Bar */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-sm text-gray-400 mb-1">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                      <div 
                        className="h-2 bg-gray-700 rounded-full overflow-hidden cursor-pointer"
                        onClick={handleProgressBarClick}
                      >
                        <div 
                          className="h-full bg-indigo-600 transition-all"
                          style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    {/* Zeige die Name der aktuell ausgewählten Stimme an */}
                    <div className="mt-2 text-sm text-gray-400">
                      Aktuelle Stimme: {ELEVENLABS_VOICES.find(v => v.id === selectedVoice)?.name || 'Standard'}
                    </div>
                  </div>

                  {/* Neuer "Generate Voiceover" Button, der auch bei vorhandenem Voiceover angezeigt wird */}
                  <button
                    onClick={handleGenerateVoiceover}
                    disabled={isGenerating || !script.trim()}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGenerating ? (
                      <>
                        <SpeakerWaveIcon className="h-5 w-5 mr-2 animate-pulse" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <SpeakerWaveIcon className="h-5 w-5 mr-2" />
                        Voiceover neu generieren
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleContinue}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    Weiter zum nächsten Schritt
                    <ArrowRightIcon className="ml-2 h-5 w-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
} 