'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { SpeakerWaveIcon, PlayIcon, PauseIcon, ArrowRightIcon, TrashIcon, ArrowDownTrayIcon, PaperAirplaneIcon, PlusIcon, CheckIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

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
        try {
          // Projekt-Daten vom Server laden
          const response = await fetch(`/api/workflow-state?projectId=${savedProjectId}`);
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.project) {
              setProjectId(data.project.id);
              
              // Wenn das Projekt ein Voiceover hat, lade es
              if (data.project.voiceoverScript) {
                setScript(data.project.voiceoverScript);
              }
              
              // Wenn das Projekt ein Voiceover-ID hat, versuche die Voiceover-Daten zu laden
              if (data.project.voiceoverId) {
                const savedVoiceoverData = localStorage.getItem('voiceoverData');
                if (savedVoiceoverData) {
                  try {
                    setVoiceoverData(JSON.parse(savedVoiceoverData));
                  } catch (e) {
                    console.error('Error parsing saved voiceover data:', e);
                  }
                }
              }
            }
          } else {
            // Wenn das Projekt nicht gefunden wurde, entferne die ID aus dem localStorage
            localStorage.removeItem('currentProjectId');
          }
        } catch (error) {
          console.error('Error loading project data:', error);
        }
      } else {
        // Fallback für ältere Version: Lade Daten aus localStorage
        const savedVoiceoverData = localStorage.getItem('voiceoverData');
        if (savedVoiceoverData) {
          try {
            setVoiceoverData(JSON.parse(savedVoiceoverData));
          } catch (e) {
            console.error('Error parsing saved voiceover data:', e);
          }
        } else {
          // Fallback für ältere Version
          const savedVoiceover = localStorage.getItem('voiceoverUrl');
          if (savedVoiceover) {
            setVoiceoverData({
              dataUrl: savedVoiceover,
              url: savedVoiceover, // Legacy: dataUrl und url sind identisch
              voiceoverId: 'legacy',
              fileName: 'voiceover.mp3'
            });
          }
        }
        
        // Lade gespeichertes Skript
        const savedScript = localStorage.getItem('voiceoverScript');
        if (savedScript && !script) {
          setScript(savedScript);
        }
      }
    };
    
    loadSavedData();
  }, [script]);

  // Audio-Wiedergabe steuern
  const togglePlay = useCallback(() => {
    if (!voiceoverData) return;

    // Die dataUrl für die Browser-Wiedergabe verwenden
    const audioUrl = voiceoverData.dataUrl;

    if (!audioElement) {
      const audio = new Audio(audioUrl)
      audio.addEventListener('ended', () => setIsPlaying(false))
      setAudioElement(audio)
      audio.play()
      setIsPlaying(true)
    } else {
      if (isPlaying) {
        audioElement.pause()
      } else {
        audioElement.play()
      }
      setIsPlaying(!isPlaying)
    }
  }, [voiceoverData, audioElement, isPlaying]);

  const handleReset = () => {
    if (audioElement) {
      audioElement.pause();
      setAudioElement(null);
    }
    setVoiceoverData(null);
    setIsPlaying(false);
    localStorage.removeItem('voiceoverData');
    localStorage.removeItem('voiceoverUrl'); // Legacy-Eintrag auch entfernen
    localStorage.removeItem('voiceoverScript');
  };

  // Voiceover-Generierung
  const handleGenerateVoiceover = async () => {
    if (!script.trim()) return
    
    setIsGenerating(true)
    setError(null)
    
    try {
      const response = await fetch('/api/generate-voiceover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate voiceover')
      }
      
      // Neue Datenstruktur mit allen relevanten Informationen
      const newVoiceoverData: VoiceoverData = {
        dataUrl: data.dataUrl || data.url, // Fallback für Kompatibilität
        url: data.url,
        voiceoverId: data.voiceoverId || 'local',
        fileName: data.fileName || 'voiceover.mp3'
      };
      
      setVoiceoverData(newVoiceoverData);
      
      // Als JSON in localStorage speichern
      localStorage.setItem('voiceoverData', JSON.stringify(newVoiceoverData));
      // Auch das Script speichern
      localStorage.setItem('voiceoverScript', script);
      
      // Workflow-Status speichern
      await saveWorkflowState(data.voiceoverId, script);
    } catch (error) {
      console.error('Failed to generate voiceover:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate voiceover')
    } finally {
      setIsGenerating(false)
    }
  }
  
  // Workflow-Status speichern
  const saveWorkflowState = async (voiceoverId: string, voiceoverScript: string) => {
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
          title: 'Mein Video-Projekt'
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to save workflow state');
      }
      
      // Projekt-ID speichern
      setProjectId(data.projectId);
      localStorage.setItem('currentProjectId', data.projectId);
      
      console.log('Workflow state saved successfully:', data);
    } catch (error) {
      console.error('Failed to save workflow state:', error);
      // Kein Fehler anzeigen, da dies ein Hintergrundprozess ist
    } finally {
      setIsSaving(false);
    }
  };

  // Zeige Ladeindikator während der Authentifizierung
  if (isLoading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
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
                placeholder="Write your voiceover script here..."
                value={script}
                onChange={(e) => setScript(e.target.value)}
              />
            </div>
            
            <div className="mt-6 flex justify-between items-center">
              <div className="text-sm text-white/40">
                {script.length} characters
              </div>
              <div className="flex gap-2">
                {voiceoverData && (
                  <button
                    onClick={handleReset}
                    className="inline-flex items-center px-4 py-3 text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-colors"
                  >
                    <TrashIcon className="h-4 w-4 mr-2" />
                    Reset
                  </button>
                )}
                <button
                  onClick={handleGenerateVoiceover}
                  disabled={isGenerating || !script.trim()}
                  className="inline-flex items-center px-6 py-3 text-lg font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGenerating ? (
                    <>
                      <SpeakerWaveIcon className="animate-pulse h-5 w-5 mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <SpeakerWaveIcon className="h-5 w-5 mr-2" />
                      Generate Voiceover
                    </>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
                {error}
              </div>
            )}

            {voiceoverData && (
              <div className="mt-8 p-4 rounded-lg bg-white/5 border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="text-white/80">Your Voiceover</div>
                  <div className="flex gap-4">
                    <button
                      onClick={togglePlay}
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
                    >
                      {isPlaying ? (
                        <>
                          <PauseIcon className="h-4 w-4 mr-2" />
                          Pause
                        </>
                      ) : (
                        <>
                          <PlayIcon className="h-4 w-4 mr-2" />
                          Play
                        </>
                      )}
                    </button>
                    <Link
                      href="/upload"
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Continue to Upload
                      <ArrowRightIcon className="ml-2 h-4 w-4" />
                    </Link>
                  </div>
                </div>
                {/* Zeige Voiceover-ID an, wenn sie aus S3 stammt */}
                {voiceoverData.voiceoverId && voiceoverData.voiceoverId !== 'legacy' && (
                  <div className="mt-2 text-xs text-white/40">
                    Voiceover gespeichert in S3 mit ID: {voiceoverData.voiceoverId}
                    {projectId && (
                      <span className="ml-2">| Projekt-ID: {projectId}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Guidelines */}
        <div className="max-w-4xl mx-auto mt-16">
          <h2 className="text-xl font-semibold text-white">Tips for Great Voiceovers</h2>
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <h3 className="text-lg font-medium text-white/90">Keep it Conversational</h3>
              <p className="mt-2 text-sm text-white/60">
                Write like you speak. Avoid complex sentences and jargon that might sound unnatural when spoken.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <h3 className="text-lg font-medium text-white/90">Consider Pacing</h3>
              <p className="mt-2 text-sm text-white/60">
                Add commas and periods to control pacing. This helps the AI understand where to pause naturally.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <h3 className="text-lg font-medium text-white/90">Match Your Video Length</h3>
              <p className="mt-2 text-sm text-white/60">
                A typical speaking pace is about 150 words per minute. Plan your script according to your video length.
              </p>
            </div>
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <h3 className="text-lg font-medium text-white/90">Test and Iterate</h3>
              <p className="mt-2 text-sm text-white/60">
                Generate multiple versions and listen to how they sound. Tweak your script based on the results.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
} 