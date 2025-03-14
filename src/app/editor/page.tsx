'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, PlayIcon, PauseIcon, ArrowPathIcon, FilmIcon, SpeakerWaveIcon, ExclamationTriangleIcon, XMarkIcon, SparklesIcon, ClockIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type UploadedVideo = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  tags: string[];
  filepath?: string;
  key?: string; // S3-Key des Videos
}

// Define error response type to match the backend
type ErrorResponse = {
  error: string;
  code: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any;
  suggestions?: string[];
}

// Define the type for file objects returned from the API
type FileInfo = {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: string;
  id: string;
}

export default function EditorPage() {
  // Session and router
  const { data: session, status } = useSession()
  const router = useRouter()
  
  // UI states
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  
  // Content states
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null)
  const [voiceoverScript, setVoiceoverScript] = useState<string>('')
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([])
  const [selectedVideos, setSelectedVideos] = useState<string[]>([])
  const [availableUploads, setAvailableUploads] = useState<FileInfo[]>([])
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null)
  
  // Error handling
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<ErrorResponse | null>(null)
  
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const isMounted = useRef(false)
  
  // Zusätzliche State für Projekt-Tracking
  const [projectId, setProjectId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  // ------------------- HOOKS SECTION -------------------
  
  // HOOK 1: Authentication check
  useEffect(() => {
    if (!isLoading && status !== 'loading') {
      if (status !== 'authenticated') {
        router.push('/auth/signin?callbackUrl=/editor')
      }
    }
    setIsLoading(false)
  }, [status, isLoading, router])

  // HOOK 2: Load data from localStorage and server
  useEffect(() => {
    // Only run in the browser, not during SSR
    if (typeof window !== 'undefined' && !isMounted.current) {
      isMounted.current = true;
      
      const savedVoiceoverData = localStorage.getItem('voiceoverData');
      if (savedVoiceoverData) {
        try {
          const voiceoverData = JSON.parse(savedVoiceoverData);
          // Für die lokale Vorschau die dataUrl verwenden
          setVoiceoverUrl(voiceoverData.dataUrl);
          // Für die Backend-Integration voiceoverId speichern
          setVoiceoverScript(localStorage.getItem('voiceoverScript') || '');
        } catch (e) {
          console.error('Error parsing saved voiceover data:', e);
        }
      } else {
        // Fallback für ältere Version
        const savedVoiceover = localStorage.getItem('voiceoverUrl');
        if (savedVoiceover) {
          setVoiceoverUrl(savedVoiceover);
          setVoiceoverScript(localStorage.getItem('voiceoverScript') || '');
        }
      }
      
      const savedFinalVideo = localStorage.getItem('finalVideoUrl')
      
      // Lade direkt Videos vom Server anstatt von localStorage
      fetchServerVideos();
      
      if (savedFinalVideo) {
        setFinalVideoUrl(savedFinalVideo)
      }
      
      // Fetch available uploads from the server (for processing queue)
      fetchAvailableUploads();
    }
  }, [])
  
  // HOOK 3: Set up final video playback
  useEffect(() => {
    if (typeof window === 'undefined' || !finalVideoUrl || finalVideoUrl === 'generated') return
    
    // Set up canvas for video playback
    const canvas = canvasRef.current
    const audio = audioRef.current
    
    if (!canvas || !audio || !voiceoverUrl) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Set canvas dimensions
    canvas.width = 640
    canvas.height = 360
    
    // Load all video elements for the segments
    const videoElements: {[key: string]: HTMLVideoElement} = {}
    
    // Create video elements for each unique video
    const uniqueVideoIds = [...new Set(selectedVideos)]
    uniqueVideoIds.forEach(videoId => {
      const video = uploadedVideos.find(v => v.id === videoId)
      if (video) {
        const videoElement = document.createElement('video')
        videoElement.src = video.url
        videoElement.muted = true
        videoElement.preload = 'auto'
        videoElement.load()
        videoElements[videoId] = videoElement
      }
    })
    
    // Set up audio
    audio.src = voiceoverUrl
    audio.load()
    
    // Clean up function
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      
      if (audio) {
        audio.pause()
        audio.src = ''
      }
      
      // Clean up video elements
      Object.values(videoElements).forEach(video => {
        video.pause()
        video.src = ''
      })
    }
  }, [finalVideoUrl, selectedVideos, uploadedVideos, voiceoverUrl])

  // HOOK 4: Set up video event listeners
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (finalVideoUrl && finalVideoUrl !== 'generated') {
      handleVideoEvents()
    }
  }, [finalVideoUrl])

  // ------------------- FUNCTIONS -------------------
  
  // Function to fetch available uploads from the server (for processing queue)
  const fetchAvailableUploads = async () => {
    try {
      const response = await fetch('/api/list-uploads');
      if (response.ok) {
        const data = await response.json();
        console.log('Available uploads:', data);
        
        // Update the state with file objects instead of just filenames
        if (data.files && data.files.length > 0) {
          setAvailableUploads(data.files);
        }
      } else {
        console.error('Failed to fetch available uploads');
      }
    } catch (error) {
      console.error('Error fetching available uploads:', error);
    }
  };

  // Function to start video playback
  const startPlayback = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Reset canvas
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Start audio
    audio.currentTime = 0;
    audio.play();
    
    // Set playing state
    setIsPlaying(true);
    
    // Start animation loop
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    // Einfachere Animation für direktes Abspielen der ausgewählten Videos
    // Wir spielen jeweils das gesamte Video ab, ohne Segmentierung
    
    // Load all video elements for the selected videos
    const videoElements: {[key: string]: HTMLVideoElement} = {};
    
    // Create video elements for each selected video
    selectedVideos.forEach(videoId => {
      const video = uploadedVideos.find(v => v.id === videoId);
      if (video) {
        const videoElement = document.createElement('video');
        videoElement.src = video.url;
        videoElement.muted = true;
        videoElement.preload = 'auto';
        videoElement.load();
        videoElements[videoId] = videoElement;
      }
    });
    
    // Berechne die Dauer jedes Videos (standardmäßig 10 Sekunden)
    const videoDurations = selectedVideos.map(() => 10); // Standard: 10 Sekunden pro Video
    
    // Berechne die Positionen, an denen jedes Video beginnt
    const videoPositions: number[] = [];
    let currentPosition = 0;
    
    for (const duration of videoDurations) {
      videoPositions.push(currentPosition);
      currentPosition += duration;
    }
    
    // Animation function
    const animate = () => {
      if (!audio || !ctx) return;
      
      const currentTime = audio.currentTime;
      
      // Find the current video based on the audio time
      let currentVideoIndex = -1;
      
      for (let i = 0; i < selectedVideos.length; i++) {
        const startTime = videoPositions[i];
        const endTime = startTime + videoDurations[i];
        
        if (currentTime >= startTime && currentTime < endTime) {
          currentVideoIndex = i;
          break;
        }
      }
      
      if (currentVideoIndex >= 0) {
        const videoId = selectedVideos[currentVideoIndex];
        const videoElement = videoElements[videoId];
        
        if (videoElement) {
          // Calculate time within the source video
          const videoTime = currentTime - videoPositions[currentVideoIndex];
          
          // Seek to the correct time in the video
          if (Math.abs(videoElement.currentTime - videoTime) > 0.2) {
            videoElement.currentTime = videoTime;
          }
          
          // Draw the current frame
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        }
      } else {
        // If no video found, show black
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      // Continue animation if still playing
      if (!audio.paused && !audio.ended) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setIsPlaying(false);
      }
    };
    
    // Start animation
    animationRef.current = requestAnimationFrame(animate);
  }, [selectedVideos, uploadedVideos]);
  
  // Function to stop video playback
  const stopPlayback = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.pause();
    setIsPlaying(false);
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, []);

  // Toggle video selection
  const toggleVideoSelection = useCallback((videoId: string) => {
    setSelectedVideos(prev => {
      if (prev.includes(videoId)) {
        return prev.filter(id => id !== videoId)
      } else {
        return [...prev, videoId]
      }
    })
  }, []);

  // Generate final video with AWS Batch
  const handleGenerateVideo = async () => {
    if (selectedVideos.length === 0) {
      setError('Bitte wählen Sie mindestens ein Video aus');
      return;
    }
    
    setIsGenerating(true);
    setGenerationProgress(10);
    setError(null);
    
    try {
      // Für jedes ausgewählte Video den S3-Key ermitteln
      const segmentsWithKeys = selectedVideos.map((videoId, index) => {
        const video = uploadedVideos.find(v => v.id === videoId);
        if (!video) return null;
        
        const videoKey = video.key || `uploads/${video.id}.${video.type.split('/')[1]}`;
        
        return {
          videoId: video.id,
          videoKey,
          startTime: 0, // Start am Anfang des Videos
          duration: 10, // Standard-Länge von 10 Sekunden pro Video
          position: index // Position basierend auf der Reihenfolge in selectedVideos
        };
      }).filter(Boolean);
      
      // Voiceover ID aus localStorage holen
      let voiceoverId = null;
      const savedVoiceoverData = localStorage.getItem('voiceoverData');
      if (savedVoiceoverData) {
        try {
          const voiceoverData = JSON.parse(savedVoiceoverData);
          if (voiceoverData.voiceoverId && voiceoverData.voiceoverId !== 'legacy' && voiceoverData.voiceoverId !== 'local') {
            voiceoverId = voiceoverData.voiceoverId;
          }
        } catch (e) {
          console.error('Error parsing saved voiceover data:', e);
        }
      }
      
      // Die neue API für die Videogenerierung aufrufen
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          segments: segmentsWithKeys,
          voiceoverId,
          title: 'Ad Video'
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Fehler bei der Generierung');
      }
      
      // Antwort verarbeiten
      const responseData = await response.json();
      console.log('Video generation response:', responseData);
      
      // Projekt-ID und Job-ID speichern
      setProjectId(responseData.projectId);
      setJobId(responseData.jobId);
      
      // Die alten States aktualisieren, um Abwärtskompatibilität zu gewährleisten
      setGenerationProgress(100);
      setFinalVideoUrl('generated');
      
      // Erfolgsmeldung anzeigen
      setError(null);
    } catch (error) {
      setError(`Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
      setIsGenerating(false);
    }
  };

  // Play/Pause function
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, startPlayback, stopPlayback]);

  // Handle video events for regular video
  const handleVideoEvents = useCallback(() => {
    const videoElement = videoRef.current
    if (videoElement) {
      videoElement.onplay = () => setIsPlaying(true)
      videoElement.onpause = () => setIsPlaying(false)
      videoElement.onended = () => setIsPlaying(false)
    }
  }, []);

  // Neue Funktion zum Laden von Videos direkt vom Server
  const fetchServerVideos = async () => {
    try {
      const response = await fetch('/api/media');
      if (response.ok) {
        const data = await response.json();
        
        if (data.files && data.files.length > 0) {
          console.log('Loaded videos from server:', data.files.length);
          
          // Konvertiere das Server-Format in unser App-Format
          const serverVideos = data.files.map((video: any) => ({
            id: video.id,
            name: video.name,
            size: video.size || 0,
            type: video.type || 'video/mp4',
            url: video.url,
            tags: video.tags || [],
            filepath: video.path,
            key: video.key
          }));
          
          setUploadedVideos(serverVideos);
        }
      } else {
        console.error('Failed to fetch videos from server');
      }
    } catch (error) {
      console.error('Error fetching videos from server:', error);
    }
  };

  // ------------------- CONDITIONAL RENDERING -------------------
  
  if (isLoading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!session) {
    return null // This should not render since we redirect
  }

  // Check if we have all required components
  const hasVoiceover = !!voiceoverUrl
  const hasVideos = uploadedVideos.length > 0

  // ------------------- RENDER -------------------
  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-secondary text-white p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold">Video Editor</h1>
          <p className="mt-2 opacity-80">Combine your videos and add a voiceover</p>
        </div>
      </div>
      
      {/* Main content */}
      <div className="max-w-7xl mx-auto p-4 mt-4">
        {/* Warning about uploads matching */}
        {uploadedVideos.length > 0 && availableUploads.length > 0 && (
          <div className="mb-6">
            <div className="alert alert-info shadow-lg">
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current flex-shrink-0 w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <div>
                  <div className="font-bold mb-1">Verfügbare Videos auf dem Server:</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {availableUploads.map((file: any) => (
                      <div key={file.name} className="badge badge-success gap-1 p-3">
                        <span className="truncate max-w-[200px]">{file.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Main grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Upload Selection */}
          <div>
            <div className="card-gradient p-6 rounded-xl mb-6">
              <div className="flex items-center mb-6">
                <FilmIcon className="h-6 w-6 text-primary mr-2" />
                <h2 className="text-xl font-semibold">Your Videos</h2>
              </div>
              
              {uploadedVideos.length === 0 ? (
                <div className="text-center py-8">
                  <FilmIcon className="h-12 w-12 mx-auto text-white/40 mb-3" />
                  <p className="text-white/60">No videos available</p>
                  <Link href="/upload" className="btn btn-primary btn-sm mt-4">
                    Upload Videos
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {uploadedVideos.map(video => {
                    const isSelected = selectedVideos.includes(video.id);
                    const videoExists = availableUploads.some(
                      file => 
                        file.id === video.id || 
                        file.name === video.name ||
                        (video.filepath && file.path === video.filepath)
                    );
                    
                    return (
                      <div 
                        key={video.id} 
                        className={`border rounded-lg overflow-hidden relative ${
                          isSelected 
                            ? 'border-primary bg-primary/10' 
                            : 'border-white/10 bg-white/5'
                        } transition-all`}
                      >
                        <div className="flex items-start p-3">
                          <div className="flex-shrink-0 w-24 h-16 bg-black rounded overflow-hidden mr-3">
                            <video 
                              src={video.url} 
                              className="w-full h-full object-cover"
                              preload="metadata"
                            />
                          </div>
                          <div className="flex-grow">
                            <div className="flex justify-between">
                              <div>
                                <h3 className="font-medium truncate">{video.name}</h3>
                                <div className="flex items-center mt-1">
                                  {!videoExists && (
                                    <span className="text-xs text-yellow-400 flex items-center mr-2">
                                      <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
                                      Nicht verfügbar
                                    </span>
                                  )}
                                  <span className="text-xs text-white/60">
                                    {formatFileSize(video.size)}
                                  </span>
                                </div>
                              </div>
                              <button 
                                onClick={() => toggleVideoSelection(video.id)}
                                className={`h-6 w-6 rounded-full border flex items-center justify-center ${
                                  isSelected 
                                    ? 'bg-primary border-primary text-white' 
                                    : 'border-white/30 text-white/30'
                                }`}
                              >
                                {isSelected && <CheckCircleIcon className="h-5 w-5" />}
                              </button>
                            </div>
                          </div>
                        </div>
                        
                        {video.tags && video.tags.length > 0 && (
                          <div className="px-3 pb-3 flex flex-wrap gap-1">
                            {video.tags.map((tag, idx) => (
                              <span key={idx} className="badge badge-xs badge-secondary">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  
                  <div className="mt-4">
                    <Link href="/upload" className="btn btn-outline btn-sm btn-block">
                      Upload More Videos
                    </Link>
                  </div>
                </div>
              )}
            </div>
            
            {/* Voiceover Section */}
            <div className="card-gradient p-6 rounded-xl">
              <div className="flex items-center mb-6">
                <SpeakerWaveIcon className="h-6 w-6 text-primary mr-2" />
                <h2 className="text-xl font-semibold">Voiceover</h2>
              </div>
              
              <div className="mb-4">
                <textarea 
                  value={voiceoverScript}
                  onChange={(e) => setVoiceoverScript(e.target.value)}
                  placeholder="Enter your voiceover script here..."
                  className="textarea textarea-bordered w-full h-32 bg-white/5 border-white/10 focus:border-primary"
                />
              </div>
              
              <button 
                onClick={handleGenerateVideo}
                disabled={!voiceoverScript.trim() || isGenerating}
                className="btn btn-primary btn-block"
              >
                {isGenerating ? (
                  <>
                    <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : voiceoverUrl ? (
                  <>
                    <ArrowPathIcon className="h-5 w-5 mr-2" />
                    Regenerate Voiceover
                  </>
                ) : (
                  <>
                    <SpeakerWaveIcon className="h-5 w-5 mr-2" />
                    Generate Voiceover
                  </>
                )}
              </button>
              
              {voiceoverUrl && (
                <div className="mt-4 p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center">
                    <audio 
                      ref={audioRef}
                      src={voiceoverUrl} 
                      controls 
                      className="w-full audio-player" 
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Right Column: Output Video */}
          <div className="col-span-2">
            {/* Video Generation */}
            <div className="mb-8 card-gradient p-6 rounded-xl">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center">
                  <SparklesIcon className="h-6 w-6 text-primary mr-2" />
                  <h2 className="text-xl font-semibold">Generate Your Ad</h2>
                </div>
              </div>
              
              {/* Warnung, wenn keine Videos ausgewählt sind */}
              {uploadedVideos.length > 0 && selectedVideos.length === 0 && (
                <div className="alert alert-warning mb-6">
                  <div className="flex">
                    <ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0" />
                    <div className="ml-3">
                      <p>Bitte wählen Sie mindestens ein Video aus, um eine Werbung zu generieren.</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Final Video Preview */}
              {finalVideoUrl && (
                <div className="bg-black/50 rounded-lg overflow-hidden border border-white/10">
                  <div className="aspect-video relative">
                    {finalVideoUrl === 'generated' ? (
                      <>
                        <canvas 
                          ref={canvasRef} 
                          className="w-full h-full"
                          onClick={togglePlay}
                        />
                        <div 
                          className="absolute inset-0 flex items-center justify-center cursor-pointer"
                          onClick={togglePlay}
                        >
                          {!isPlaying && (
                            <button className="bg-primary/30 backdrop-blur-sm p-5 rounded-full transform transition-all duration-300 hover:scale-110 hover:bg-primary/50">
                              <PlayIcon className="h-10 w-10 text-white" />
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <video 
                        ref={videoRef}
                        src={finalVideoUrl} 
                        controls
                        className="w-full h-full" 
                      />
                    )}
                  </div>
                </div>
              )}
              
              {/* Generate Button */}
              <div className="mt-6">
                <button 
                  onClick={handleGenerateVideo}
                  disabled={isGenerating || selectedVideos.length === 0}
                  className="btn btn-primary btn-block btn-lg"
                >
                  {isGenerating ? (
                    <div className="flex items-center">
                      <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                      <span>Generating Video ({generationProgress}%)</span>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <SparklesIcon className="h-5 w-5 mr-2" />
                      <span>Generate Ad</span>
                    </div>
                  )}
                </button>
                
                {projectId && (
                  <div className="mt-2 flex justify-center text-white/40 text-sm">
                    <ClockIcon className="h-4 w-4 mr-1" />
                    <span>Project ID: {projectId.substring(0, 8)}</span>
                  </div>
                )}
              </div>
              
              {/* Error Display */}
              {error && (
                <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
                  <div className="flex items-start">
                    <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 mt-0.5 mr-2" />
                    <div>
                      <p>{error}</p>
                      {errorDetails && (
                        <div className="mt-2 text-sm">
                          <p className="font-medium">Details:</p>
                          <pre className="mt-1 bg-red-500/5 p-2 rounded overflow-auto text-xs">
                            {JSON.stringify(errorDetails, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Final Video Section */}
            <div className="card-gradient p-6 rounded-xl">
              <div className="flex items-center mb-6">
                <FilmIcon className="h-6 w-6 text-primary mr-2" />
                <h2 className="text-xl font-semibold">Final Video</h2>
              </div>
              
              {isGenerating && (
                <div className="p-8 text-center">
                  <div className="inline-block rounded-full bg-primary/20 p-6 mb-4">
                    <ArrowPathIcon className="h-8 w-8 text-primary animate-spin" />
                  </div>
                  <p className="text-lg font-medium">Generating your ad video...</p>
                  <p className="text-white/60 mt-2">This may take a few minutes</p>
                  <div className="mt-6 w-full bg-white/10 h-3 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-500"
                      style={{ width: `${generationProgress}%` }}
                    />
                  </div>
                </div>
              )}
              
              {!isGenerating && !finalVideoUrl && (
                <div className="text-center py-12">
                  <FilmIcon className="h-12 w-12 mx-auto text-white/30 mb-3" />
                  <p className="text-white/60">No final video generated yet</p>
                  <p className="text-white/40 text-sm mt-2">
                    Select videos and generate your ad to see the result here
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper functions
function getColorForIndex(index: number): string {
  const colors = [
    '#7C3AED', // primary
    '#8B5CF6', // primary-light
    '#6D28D9', // primary-dark
    '#10B981', // secondary
    '#F59E0B', // accent
    '#3B82F6', // blue
    '#EC4899', // pink
  ];
  
  return colors[index % colors.length];
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
} 