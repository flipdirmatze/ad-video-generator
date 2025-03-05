'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { SpeakerWaveIcon, PlayIcon, PauseIcon, ArrowRightIcon, TrashIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

export default function VoiceoverPage() {
  const [script, setScript] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Check if we have a saved voiceover
  useEffect(() => {
    const savedVoiceover = localStorage.getItem('voiceoverUrl');
    if (savedVoiceover) {
      setVoiceoverUrl(savedVoiceover);
    }
  }, []);

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
      
      setVoiceoverUrl(data.url)
      
      // Save to localStorage
      localStorage.setItem('voiceoverUrl', data.url);
      // Also save the script
      localStorage.setItem('voiceoverScript', script);
    } catch (error) {
      console.error('Failed to generate voiceover:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate voiceover')
    } finally {
      setIsGenerating(false)
    }
  }

  const togglePlay = useCallback(() => {
    if (!voiceoverUrl) return

    if (!audioElement) {
      const audio = new Audio(voiceoverUrl)
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
  }, [voiceoverUrl, audioElement, isPlaying])

  // Reset voiceover and script
  const handleReset = () => {
    // Stop audio if playing
    if (audioElement && isPlaying) {
      audioElement.pause();
      setIsPlaying(false);
    }
    
    // Clear audio element
    setAudioElement(null);
    
    // Remove from localStorage
    localStorage.removeItem('voiceoverUrl');
    localStorage.removeItem('voiceoverScript');
    
    // Clear state
    setVoiceoverUrl(null);
    
    // Optionally, you can decide whether to clear the script input or keep it
    // setScript('');
    
    setError(null);
  };

  // Load saved script if available
  useEffect(() => {
    const savedScript = localStorage.getItem('voiceoverScript');
    if (savedScript && !script) {
      setScript(savedScript);
    }
  }, [script]);

  return (
    <div className="container py-12">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold sm:text-5xl bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
            Create Your Voiceover
          </h1>
          <p className="mt-4 text-lg text-white/60">
            Write your script and let AI generate a professional voiceover
          </p>
        </div>
        
        <div className="relative rounded-2xl border border-white/10 bg-background-light/50 p-8 backdrop-blur-xl">
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent rounded-2xl" />
          <div className="relative">
            <textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Enter your script here..."
              className="w-full h-40 p-4 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:border-primary/50 transition-colors"
            />
            
            <div className="mt-6 flex justify-between items-center">
              <div className="text-sm text-white/40">
                {script.length} characters
              </div>
              <div className="flex gap-2">
                {voiceoverUrl && (
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

            {voiceoverUrl && (
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
              </div>
            )}
          </div>
        </div>

        {/* Guidelines */}
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <div className="relative rounded-2xl border border-white/10 bg-background-light/50 p-6 backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent rounded-2xl" />
            <div className="relative">
              <h3 className="text-xl font-semibold text-white mb-4">
                Script Guidelines
              </h3>
              <ul className="space-y-3 text-white/60">
                <li className="flex items-center">
                  <span className="mr-2">•</span>
                  Keep it concise and clear
                </li>
                <li className="flex items-center">
                  <span className="mr-2">•</span>
                  Use natural, conversational language
                </li>
                <li className="flex items-center">
                  <span className="mr-2">•</span>
                  Include pauses with punctuation
                </li>
                <li className="flex items-center">
                  <span className="mr-2">•</span>
                  Aim for 30-60 seconds of speech
                </li>
              </ul>
            </div>
          </div>

          <div className="relative rounded-2xl border border-white/10 bg-background-light/50 p-6 backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent rounded-2xl" />
            <div className="relative">
              <h3 className="text-xl font-semibold text-white mb-4">
                Tips for Better Results
              </h3>
              <ul className="space-y-3 text-white/60">
                <li className="flex items-center">
                  <span className="mr-2">•</span>
                  Test different tones and pacing
                </li>
                <li className="flex items-center">
                  <span className="mr-2">•</span>
                  Use emphasis marks for key points
                </li>
                <li className="flex items-center">
                  <span className="mr-2">•</span>
                  Break long sentences into shorter ones
                </li>
                <li className="flex items-center">
                  <span className="mr-2">•</span>
                  Preview before finalizing
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 