'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, PlayIcon, PauseIcon, ArrowPathIcon, FilmIcon, SpeakerWaveIcon, ExclamationTriangleIcon, XMarkIcon, SparklesIcon, ClockIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
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
  code?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details?: any;
  suggestions?: string[];
  jobDetails?: any;
  logs?: string;
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

// Typ für gematchte Videos aus dem Workflow
type MatchedVideo = {
  videoId: string;
  segmentId: string;
  score: number;
  startTime: number;
  duration: number;
  position: number;
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
  const [videoDuration, setVideoDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [fromScriptMatcher, setFromScriptMatcher] = useState(false)
  const [workflowStatusMessage, setWorkflowStatusMessage] = useState('')
  const [shouldAutoGenerate, setShouldAutoGenerate] = useState(false)
  
  // Content states
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null)
  const [voiceoverScript, setVoiceoverScript] = useState<string>('')
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([])
  const [selectedVideos, setSelectedVideos] = useState<string[]>([])
  const [availableUploads, setAvailableUploads] = useState<FileInfo[]>([])
  const [finalVideoUrl, setFinalVideoUrl] = useState<string>('')
  const [signedVideoUrl, setSignedVideoUrl] = useState<string>('')
  
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
  const [projectId, setProjectId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [matchedVideos, setMatchedVideos] = useState<MatchedVideo[]>([])
  const [workflowStep, setWorkflowStep] = useState<string | null>(null)
  const [isLoadingProject, setIsLoadingProject] = useState(false)
  
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
      
      // Lade das aktuelle Projekt aus dem localStorage
      const loadProjectData = async () => {
        setIsLoadingProject(true);
        
        try {
          const savedProjectId = localStorage.getItem('currentProjectId');
          
          if (savedProjectId) {
            console.log('Loading project data from server:', savedProjectId);
            
            // Projekt-Daten vom Server laden
            const response = await fetch(`/api/workflow-state?projectId=${savedProjectId}`);
            
            if (response.ok) {
              const data = await response.json();
              
              if (data.success && data.project) {
                console.log('Project data loaded:', data.project);
                
                // Projekt-ID setzen
                setProjectId(data.project.id);
                
                // Workflow-Schritt setzen
                setWorkflowStep(data.project.workflowStep);
                
                // Wenn das Projekt ein Voiceover-Script hat, lade es
                if (data.project.voiceoverScript) {
                  setVoiceoverScript(data.project.voiceoverScript);
                }
                
                // Wenn das Projekt gematchte Videos hat, lade sie
                if (data.project.matchedVideos && data.project.matchedVideos.length > 0) {
                  setMatchedVideos(data.project.matchedVideos);
                  
                  // Extrahiere die Video-IDs für die Auswahl
                  const videoIds = data.project.matchedVideos.map((match: MatchedVideo) => match.videoId);
                  setSelectedVideos(videoIds);
                  setFromScriptMatcher(true);
                  
                  // Wenn wir direkt vom Script-Matcher kommen, automatisch generieren
                  if (data.project.workflowStep === 'editing') {
                    setShouldAutoGenerate(true);
                    setWorkflowStatusMessage('Videos wurden aus dem Script-Matcher geladen. Die Werbung wird automatisch generiert.');
                  }
                }
                
                // Wenn das Projekt bereits ein fertiges Video hat, lade es
                if (data.project.outputUrl) {
                  setFinalVideoUrl(data.project.outputUrl);
                  setWorkflowStatusMessage('Deine Werbung wurde erfolgreich generiert!');
                }
              }
            } else {
              // Wenn das Projekt nicht gefunden wurde, entferne die ID aus dem localStorage
              localStorage.removeItem('currentProjectId');
            }
          }
          
          // Lade Voiceover-Daten aus localStorage (für Abwärtskompatibilität)
          const savedVoiceoverData = localStorage.getItem('voiceoverData');
          if (savedVoiceoverData) {
            try {
              const voiceoverData = JSON.parse(savedVoiceoverData);
              // Für die lokale Vorschau die dataUrl verwenden
              setVoiceoverUrl(voiceoverData.dataUrl);
              // Für die Backend-Integration voiceoverId speichern
              if (!voiceoverScript) {
                setVoiceoverScript(localStorage.getItem('voiceoverScript') || '');
              }
            } catch (e) {
              console.error('Error parsing saved voiceover data:', e);
            }
          } else {
            // Fallback für ältere Version
            const savedVoiceover = localStorage.getItem('voiceoverUrl');
            if (savedVoiceover) {
              setVoiceoverUrl(savedVoiceover);
              if (!voiceoverScript) {
                setVoiceoverScript(localStorage.getItem('voiceoverScript') || '');
              }
            }
          }
          
          // Lade Videos vom Server
          await fetchServerVideos();
          
          // Lade verfügbare Uploads vom Server (für die Verarbeitungswarteschlange)
          await fetchAvailableUploads();
          
        } catch (error) {
          console.error('Error loading project data:', error);
          setError('Fehler beim Laden der Projektdaten');
        } finally {
          setIsLoadingProject(false);
          setIsLoading(false);
        }
      };
      
      loadProjectData();
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
      const setupVideoEvents = () => {
        const videoElement = document.getElementById('finalVideo') as HTMLVideoElement;
        if (!videoElement) return;
        
        videoElement.onloadedmetadata = () => {
          setVideoDuration(videoElement.duration);
        };
        
        videoElement.ontimeupdate = () => {
          setCurrentTime(videoElement.currentTime);
        };
        
        videoElement.onended = () => {
          setIsPlaying(false);
        };
      };
      
      setupVideoEvents();
    }
  }, [finalVideoUrl])

  // HOOK 5: Check project status and load video when ready
  useEffect(() => {
    if (!projectId || !jobId || !isGenerating) return;
    
    // Funktion zum Abrufen des Projekt-Status
    const checkProjectStatus = async () => {
      try {
        const response = await fetch(`/api/project-status/${projectId}`);
        if (!response.ok) {
          console.error('Failed to fetch project status');
          return;
        }
        
        const data = await response.json();
        
        if (data.status === 'completed') {
          // Video ist fertig! Setze final video URL
          setFinalVideoUrl(data.outputUrl);
          setSignedVideoUrl(data.signedUrl || data.outputUrl);
          setIsGenerating(false);
          setGenerationProgress(100);
          
          // Update workflow status to completed
          await saveWorkflowState('completed');
          
          setWorkflowStatusMessage('Deine Werbung wurde erfolgreich generiert!');
          
          // Keine weiteren Status-Checks notwendig
          return true;
        } else if (data.status === 'failed') {
          // Fehler bei der Generierung
          setError('Video generation failed');
          setErrorDetails(data.error || null);
          setIsGenerating(false);
          setGenerationProgress(0);
          
          // Update workflow status to failed
          await saveWorkflowState('failed');
          
          // Keine weiteren Status-Checks notwendig
          return true;
        } else if (data.status === 'processing') {
          // Update progress if available
          if (data.progress) {
            setGenerationProgress(Math.min(20 + data.progress * 0.8, 99)); // Scale 0-100 to 20-99
          }
        }
        
        // Weiter prüfen, wenn der Status noch "processing" ist
        return false;
      } catch (error) {
        console.error('Error checking project status:', error);
        return false;
      }
    };
    
    // Initialer Status-Check
    checkProjectStatus();
    
    // Status-Check alle 3 Sekunden
    const intervalId = setInterval(async () => {
      const shouldStop = await checkProjectStatus();
      if (shouldStop) {
        clearInterval(intervalId);
      }
    }, 3000);
    
    // Cleanup
    return () => {
      clearInterval(intervalId);
    };
  }, [projectId, jobId, isGenerating]);

  // HOOK: Auto-generate video when appropriate
  useEffect(() => {
    // Nur ausführen, wenn alle Bedingungen erfüllt sind
    if (shouldAutoGenerate && selectedVideos.length > 0 && voiceoverUrl && !isGenerating && !finalVideoUrl) {
      // Kurze Verzögerung, damit der Benutzer sehen kann, was passiert
      const timer = setTimeout(() => {
        handleGenerateVideo();
        setShouldAutoGenerate(false);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [shouldAutoGenerate, selectedVideos, voiceoverUrl, isGenerating, finalVideoUrl]);

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

  // Generate video function
  const handleGenerateVideo = async () => {
    if (!voiceoverUrl || !voiceoverScript.trim() || selectedVideos.length === 0) {
      setError('Bitte wählen Sie ein Voiceover und mindestens ein Video aus');
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    setErrorDetails(null);
    
    try {
      // Finde die Voiceover-ID, falls vorhanden
      let voiceoverId = 'local';
      
      // Versuche, die Voiceover-ID aus dem localStorage zu laden
      const savedVoiceoverData = localStorage.getItem('voiceoverData');
      if (savedVoiceoverData) {
        try {
          const parsedData = JSON.parse(savedVoiceoverData);
          if (parsedData.voiceoverId && parsedData.voiceoverId !== 'legacy') {
            voiceoverId = parsedData.voiceoverId;
          }
        } catch (e) {
          console.error('Error parsing saved voiceover data:', e);
        }
      }
      
      // Erstelle Segmente für jedes ausgewählte Video
      const segmentsWithKeys = selectedVideos.map((videoId, index) => {
        // Finde das originale Video
        const video = uploadedVideos.find(v => v.id === videoId);
        
        // Finde das gematchte Video, falls vorhanden
        const matchedVideo = matchedVideos.find(m => m.videoId === videoId);
        
        return {
          videoId,
          filepath: video?.filepath || video?.key || '',
          startTime: matchedVideo?.startTime || 0,
          duration: matchedVideo?.duration || 5, // Fallback auf 5 Sekunden
          position: matchedVideo?.position || index
        };
      });
      
      // API-Request zum Generieren des Videos
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          segments: segmentsWithKeys,
          voiceoverId,
          title: 'Ad Video',
          projectId // Übergebe die Projekt-ID, falls vorhanden
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
      
      // Update workflow status
      await saveWorkflowState('processing');
      
      // Setze den Fortschritt auf 20%, da der Job jetzt gestartet wurde
      setGenerationProgress(20);
      
      // Wir setzen isGenerating nicht zurück, da der Hook 5 den Status überwacht
      // und automatisch isGenerating zurücksetzt, wenn das Video fertig ist
    } catch (error) {
      setError(`Fehler: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`);
      setIsGenerating(false);
    }
  };

  // Save workflow state
  const saveWorkflowState = async (newWorkflowStep: string) => {
    if (!projectId) return;
    
    try {
      const response = await fetch('/api/workflow-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId,
          workflowStep: newWorkflowStep
        })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update workflow state');
      }
      
      // Update local state
      setWorkflowStep(newWorkflowStep);
      
      console.log(`Workflow state updated to ${newWorkflowStep}`);
    } catch (error) {
      console.error('Error updating workflow state:', error);
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
          return serverVideos; // Return the videos for chaining
        }
      } else {
        console.error('Failed to fetch videos from server');
      }
      return []; // Return empty array if no videos found
    } catch (error) {
      console.error('Error fetching videos from server:', error);
      return []; // Return empty array on error
    }
  };

  // ------------------- CONDITIONAL RENDERING -------------------
  
  if (isLoading || status === 'loading' || isLoadingProject) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900">
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-white">
          {isLoadingProject ? 'Lade Projektdaten...' : 'Lade...'}
        </p>
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
          
          {workflowStatusMessage && (
            <div className="mb-6 p-4 bg-green-900/30 border border-green-500/30 rounded-lg text-green-400 mt-4">
              <p className="flex items-center">
                <CheckCircleIcon className="h-5 w-5 mr-2" />
                {workflowStatusMessage}
              </p>
            </div>
          )}
          
          {projectId && (
            <div className="mt-4 text-sm opacity-70">
              Projekt-ID: {projectId}
              {workflowStep && (
                <span className="ml-2">• Workflow-Schritt: {workflowStep}</span>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Main content */}
      <div className="max-w-7xl mx-auto p-4 mt-4">
        {/* Workflow Status Section */}
        {projectId && (
          <div className="mb-8 bg-base-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Workflow Status</h2>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <div className={`flex-1 rounded-lg p-4 border ${workflowStep === 'voiceover' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-center mb-2">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full mr-2 text-xs ${workflowStep === 'voiceover' ? 'bg-primary text-white' : workflowStep && ['matching', 'editing', 'processing', 'completed'].includes(workflowStep) ? 'bg-green-500 text-white' : 'bg-white/20 text-white/60'}`}>
                    {workflowStep && ['matching', 'editing', 'processing', 'completed'].includes(workflowStep) ? '✓' : '1'}
                  </span>
                  <span className="font-medium">Voiceover</span>
                </div>
                <p className="text-sm text-white/60 ml-8">
                  {voiceoverScript ? 'Voiceover erstellt' : 'Voiceover erstellen'}
                </p>
              </div>
              
              <div className={`flex-1 rounded-lg p-4 border ${workflowStep === 'matching' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-center mb-2">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full mr-2 text-xs ${workflowStep === 'matching' ? 'bg-primary text-white' : workflowStep && ['editing', 'processing', 'completed'].includes(workflowStep) ? 'bg-green-500 text-white' : 'bg-white/20 text-white/60'}`}>
                    {workflowStep && ['editing', 'processing', 'completed'].includes(workflowStep) ? '✓' : '2'}
                  </span>
                  <span className="font-medium">Video Matching</span>
                </div>
                <p className="text-sm text-white/60 ml-8">
                  {matchedVideos.length > 0 ? `${matchedVideos.length} Videos zugeordnet` : 'Videos zum Skript matchen'}
                </p>
              </div>
              
              <div className={`flex-1 rounded-lg p-4 border ${workflowStep === 'editing' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-center mb-2">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full mr-2 text-xs ${workflowStep === 'editing' ? 'bg-primary text-white' : workflowStep && ['processing', 'completed'].includes(workflowStep) ? 'bg-green-500 text-white' : 'bg-white/20 text-white/60'}`}>
                    {workflowStep && ['processing', 'completed'].includes(workflowStep) ? '✓' : '3'}
                  </span>
                  <span className="font-medium">Anpassen & Generieren</span>
                </div>
                <p className="text-sm text-white/60 ml-8">
                  {finalVideoUrl ? 'Video generiert' : isGenerating ? 'Video wird generiert...' : 'Werbevideo erstellen'}
                </p>
              </div>
              
              <div className={`flex-1 rounded-lg p-4 border ${workflowStep === 'completed' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-center mb-2">
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full mr-2 text-xs ${workflowStep === 'completed' ? 'bg-primary text-white' : 'bg-white/20 text-white/60'}`}>
                    {workflowStep === 'completed' ? '✓' : '4'}
                  </span>
                  <span className="font-medium">Fertig</span>
                </div>
                <p className="text-sm text-white/60 ml-8">
                  {finalVideoUrl ? 'Video bereit zum Teilen' : 'Warte auf fertiges Video'}
                </p>
              </div>
            </div>
          </div>
        )}

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
                  <div className="aspect-video relative flex items-center justify-center bg-black">
                    {finalVideoUrl === 'generated' ? (
                      <>
                        <canvas 
                          ref={canvasRef} 
                          className="max-w-full max-h-full object-contain"
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
                        id="finalVideo"
                        ref={videoRef}
                        src={signedVideoUrl || finalVideoUrl} 
                        controls
                        className="w-full h-full object-contain" 
                        playsInline
                      />
                    )}
                  </div>
                  
                  {/* Video Controls and Download Button */}
                  {finalVideoUrl && finalVideoUrl !== 'generated' && (
                    <div className="p-3 bg-black/30 flex justify-between items-center">
                      <div className="text-sm text-white/70">
                        {videoDuration > 0 ? `Dauer: ${Math.floor(videoDuration / 60)}:${String(Math.floor(videoDuration % 60)).padStart(2, '0')}` : 'Video bereit'}
                      </div>
                      <a 
                        href={signedVideoUrl || finalVideoUrl} 
                        download="generated-ad.mp4"
                        className="btn btn-sm btn-primary"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4 mr-1" />
                        Download Video
                      </a>
                    </div>
                  )}
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
                  ) : finalVideoUrl ? (
                    <div className="flex items-center">
                      <CheckCircleIcon className="h-5 w-5 mr-2 text-green-400" />
                      <span>Video Ready</span>
                    </div>
                  ) : (
                    <div className="flex items-center">
                      <SparklesIcon className="h-5 w-5 mr-2" />
                      <span>Generate Ad</span>
                    </div>
                  )}
                </button>
                
                {/* Progress Bar */}
                {isGenerating && (
                  <div className="mt-3">
                    <div className="w-full bg-white/10 rounded-full h-2.5">
                      <div 
                        className="bg-primary h-2.5 rounded-full transition-all duration-300" 
                        style={{ width: `${generationProgress}%` }}
                      ></div>
                    </div>
                    <div className="mt-1 text-xs text-white/50 text-center">
                      {generationProgress < 100 ? 'Generating your video...' : 'Finalizing...'}
                    </div>
                  </div>
                )}
                
                {projectId && !isGenerating && (
                  <div className="mt-2 flex justify-center text-white/40 text-sm">
                    {finalVideoUrl ? (
                      <div className="flex items-center">
                        <CheckCircleIcon className="h-4 w-4 mr-1 text-green-400" />
                        <span>Video successfully generated</span>
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <ClockIcon className="h-4 w-4 mr-1" />
                        <span>Project ID: {projectId.substring(0, 8)}</span>
                      </div>
                    )}
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
                          {errorDetails.jobDetails ? (
                            <>
                              <div className="mt-2">
                                <h4 className="font-medium">Job Details:</h4>
                                <pre className="mt-1 bg-red-500/5 p-2 rounded overflow-auto text-xs">
                                  {JSON.stringify(errorDetails.jobDetails, null, 2)}
                                </pre>
                              </div>
                              {errorDetails.logs && (
                                <div className="mt-2">
                                  <h4 className="font-medium">Logs:</h4>
                                  <pre className="mt-1 bg-red-500/5 p-2 rounded overflow-auto text-xs max-h-40">
                                    {errorDetails.logs}
                                  </pre>
                                </div>
                              )}
                            </>
                          ) : (
                            <pre className="mt-1 bg-red-500/5 p-2 rounded overflow-auto text-xs">
                              {JSON.stringify(errorDetails, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                      
                      {/* Job-Details-Button */}
                      {jobId && (
                        <div className="mt-3">
                          <button 
                            onClick={async () => {
                              try {
                                const response = await fetch(`/api/aws-batch-logs/${jobId}`);
                                if (!response.ok) {
                                  throw new Error('Failed to fetch job logs');
                                }
                                const data = await response.json();
                                setErrorDetails({
                                  error: 'AWS Batch Job Details',
                                  jobDetails: data.job,
                                  logs: data.logs.map((log: any) => log.message).join('\n')
                                });
                              } catch (error) {
                                console.error('Error fetching job logs:', error);
                              }
                            }}
                            className="btn btn-xs btn-outline"
                          >
                            Show Job Details
                          </button>
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
              
              {isGenerating && !finalVideoUrl && (
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
              
              {finalVideoUrl && (
                <div className="p-8 text-center">
                  <div className="inline-block rounded-full bg-green-500/20 p-6 mb-4">
                    <CheckCircleIcon className="h-8 w-8 text-green-500" />
                  </div>
                  <p className="text-lg font-medium">Your ad video is ready!</p>
                  <p className="text-white/60 mt-2">You can view and download it above</p>
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