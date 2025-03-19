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
  thumbnailUrl?: string;
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

// VideoThumbnail-Komponente mit Lazy-Loading
const VideoThumbnail = React.memo(({ video, match, index }: { 
  video: UploadedVideo | undefined; 
  match: MatchedVideo; 
  index: number;
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const thumbnailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Simplify intersection observer for better performance
    if (!thumbnailRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );
    
    observer.observe(thumbnailRef.current);
    
    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={thumbnailRef}
      className="bg-gray-900/60 border border-gray-800 rounded overflow-hidden"
    >
      <div className="aspect-video bg-gray-900 relative overflow-hidden">
        {isVisible ? (
          video?.thumbnailUrl ? (
            // Use an img tag with explicit dimensions for better memory management
            <img 
              src={video.thumbnailUrl} 
              alt={video.name || `Video ${index + 1}`}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              width="160"
              height="90"
            />
          ) : (
            // Fallback: Zeige ein statisches SVG-Symbol
            <div className="absolute inset-0 flex items-center justify-center">
              <FilmIcon className="h-8 w-8 text-gray-700" />
            </div>
          )
        ) : (
          // Skeleton loader while not visible
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-full h-full bg-gray-800 animate-pulse"></div>
          </div>
        )}
        <div className="absolute bottom-1 right-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
          {match.duration}s
        </div>
      </div>
      <div className="p-2">
        <div className="text-xs font-medium truncate">{video?.name || `Video ${index + 1}`}</div>
        <div className="text-xs text-gray-500 mt-0.5">Match: {Math.round(match.score * 100)}%</div>
      </div>
    </div>
  );
});

VideoThumbnail.displayName = 'VideoThumbnail';

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
  const [addCaptions, setAddCaptions] = useState(false)
  const [subtitleOptions, setSubtitleOptions] = useState({
    fontName: 'Arial',
    fontSize: 24,
    primaryColor: '#FFFFFF',
    backgroundColor: '#80000000',
    borderStyle: 4,
    position: 'bottom'
  })
  
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
                  
                  // Setze automatisch den Status
                  if (data.project.workflowStep === 'editing') {
                    setWorkflowStatusMessage('Videos wurden aus dem Script-Matcher geladen und sind bereit zur Generierung.');
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
          
          // First load the project data before loading videos to ensure proper sequence
          await fetchServerVideos();
          
          // Wait a moment before loading available uploads to reduce concurrency
          setTimeout(() => {
            fetchAvailableUploads();
          }, 1000);
          
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

  // Load all video elements for the selected videos
  useEffect(() => {
    // Only run this if we have videos to process
    if (uploadedVideos.length === 0 || selectedVideos.length === 0) return;
    
    // Safer thumbnailing approach
    const generateThumbnails = async () => {
      // Identify videos that need thumbnails
      const videosNeedingThumbnails = selectedVideos
        .map(videoId => uploadedVideos.find(v => v.id === videoId))
        .filter((video): video is UploadedVideo => !!video && !video.thumbnailUrl);
      
      // Don't do anything if all videos already have thumbnails
      if (videosNeedingThumbnails.length === 0) return;
      
      console.log(`Generating thumbnails for ${videosNeedingThumbnails.length} videos`);
      
      // Process videos in sequential batches to avoid memory issues
      const BATCH_SIZE = 2;
      
      for (let i = 0; i < videosNeedingThumbnails.length; i += BATCH_SIZE) {
        const batch = videosNeedingThumbnails.slice(i, i + BATCH_SIZE);
        
        // Sequential processing within batch for stability
        for (const video of batch) {
          try {
            // Simple, more reliable thumbnail generation
            await generateSingleThumbnail(video);
            // Small delay between processing videos to prevent UI freezing
            await new Promise(r => setTimeout(r, 100));
          } catch (err) {
            console.error(`Error generating thumbnail for video ${video.id}:`, err);
            // Continue with other videos even if one fails
          }
        }
      }
    };
    
    // Simplified, robust thumbnail generator for a single video
    const generateSingleThumbnail = (video: UploadedVideo): Promise<void> => {
      return new Promise((resolve, reject) => {
        const videoEl = document.createElement('video');
        
        // Set up video properties
        videoEl.muted = true;
        videoEl.crossOrigin = "anonymous";
        videoEl.preload = "metadata";
        
        // Cleanup function to ensure resources are released
        const cleanup = () => {
          videoEl.onloadedmetadata = null;
          videoEl.onerror = null;
          videoEl.onseeked = null;
          videoEl.onloadeddata = null;
          videoEl.pause();
          videoEl.remove();
        };
        
        // Set up a timeout to avoid hanging
        const timeoutId = setTimeout(() => {
          cleanup();
          // Don't reject, just resolve without thumbnail to avoid stopping the process
          console.warn(`Thumbnail generation timed out for video ${video.id}`);
          resolve();
        }, 5000);
        
        // Error handler
        videoEl.onerror = () => {
          clearTimeout(timeoutId);
          cleanup();
          resolve(); // Continue without thumbnail
        };
        
        // Once metadata is loaded, seek to a good position for thumbnail
        videoEl.onloadedmetadata = () => {
          // Try to seek to 10% of the video for thumbnail
          const seekPosition = Math.min(videoEl.duration * 0.1, 1);
          videoEl.currentTime = seekPosition;
        };
        
        // After seeking, capture the frame
        videoEl.onseeked = () => {
          try {
            // Create a small canvas for the thumbnail
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Set to small dimensions to save memory
            canvas.width = 160;  // Smaller dimensions
            canvas.height = 90;  // 16:9 ratio
            
            if (ctx && videoEl.videoWidth) {
              // Draw the video frame
              ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
              
              // Convert to JPEG with lower quality
              const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.5);
              
              // Update the videos array with the new thumbnail
              setUploadedVideos(prev => 
                prev.map(v => v.id === video.id ? {...v, thumbnailUrl} : v)
              );
              
              // Cleanup resources
              clearTimeout(timeoutId);
              cleanup();
              canvas.remove();
              resolve();
            } else {
              clearTimeout(timeoutId);
              cleanup();
              resolve(); // Continue without thumbnail
            }
          } catch (err) {
            clearTimeout(timeoutId);
            cleanup();
            console.error('Error in thumbnail generation:', err);
            resolve(); // Continue without thumbnail
          }
        };
        
        // Set the source after setting up all handlers
        videoEl.src = video.url;
      });
    };
    
    // Run the thumbnail generation
    generateThumbnails();
  }, [uploadedVideos, selectedVideos]);

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
    audio.play().catch(err => {
      console.error('Failed to play audio:', err);
      setIsPlaying(false);
      return;
    });
    
    // Set playing state
    setIsPlaying(true);
    
    // Clean up previous animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    
    // Create a single video element we can reuse
    const videoElement = document.createElement('video');
    videoElement.muted = true;
    videoElement.preload = 'auto';
    
    // Track current playing video index
    let currentVideoIndex = 0;
    let isVideoLoading = false;
    
    // Function to load a specific video
    const loadVideo = (index: number) => {
      if (index >= selectedVideos.length) return false;
      
      const videoId = selectedVideos[index];
      const video = uploadedVideos.find(v => v.id === videoId);
      
      if (!video) return false;
      
      isVideoLoading = true;
      videoElement.src = video.url;
      videoElement.load();
      
      // Handle video loaded
      videoElement.onloadeddata = () => {
        isVideoLoading = false;
      };
      
      // Handle errors
      videoElement.onerror = () => {
        console.error(`Error loading video ${videoId}`);
        isVideoLoading = false;
        // Try next video
        currentVideoIndex++;
        if (!loadVideo(currentVideoIndex)) {
          stopPlayback();
        }
      };
      
      return true;
    };
    
    // Load first video
    if (!loadVideo(0)) {
      stopPlayback();
      return;
    }
    
    // Animation function
    const animate = () => {
      if (!audio || !ctx) return;
      
      // If audio ended, stop playback
      if (audio.ended || audio.paused) {
        stopPlayback();
        return;
      }
      
      // Draw current video frame
      if (!isVideoLoading && videoElement.readyState >= 2) {
        try {
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
        } catch (e) {
          console.error('Error drawing video frame:', e);
        }
        
        // Simple timing - change video every ~5 seconds
        const videoPlayTime = 5; // seconds
        const totalElapsed = audio.currentTime;
        const shouldBeOnVideoIndex = Math.floor(totalElapsed / videoPlayTime);
        
        // If we should move to next video
        if (shouldBeOnVideoIndex > currentVideoIndex && shouldBeOnVideoIndex < selectedVideos.length) {
          currentVideoIndex = shouldBeOnVideoIndex;
          loadVideo(currentVideoIndex);
        }
      } else {
        // Show loading state - black screen or loading indicator
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
    
    // Return cleanup function
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      
      if (videoElement) {
        videoElement.pause();
        videoElement.src = '';
        videoElement.load();
        videoElement.remove();
      }
    };
  }, [selectedVideos, uploadedVideos]);

  // Function to stop video playback
  const stopPlayback = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
    }
    
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
        
        // Stelle sicher, dass wir den korrekten S3-Key verwenden
        const videoKey = video?.key || (video?.filepath?.startsWith('uploads/') ? video.filepath : `uploads/${videoId}.mp4`);
        
        return {
          videoId,
          // Wichtig: Der Backend erwartet den S3-Key und nicht den vollständigen Pfad
          videoKey: videoKey,
          startTime: matchedVideo?.startTime || 0,
          duration: matchedVideo?.duration || 5, // Fallback auf 5 Sekunden
          position: matchedVideo?.position || index
        };
      });
      
      console.log('Sending segments to API:', segmentsWithKeys);
      
      // Optionen für das generierte Video
      const videoOptions = {
        addSubtitles: addCaptions,
        subtitleOptions: addCaptions ? subtitleOptions : undefined
      };

      // API-Request zum Generieren des Videos
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          segments: segmentsWithKeys,
          voiceoverId,
          voiceoverText: voiceoverScript, // Für Untertitel
          title: 'Ad Video',
          projectId, // Übergebe die Projekt-ID, falls vorhanden
          addSubtitles: videoOptions.addSubtitles,
          subtitleOptions: videoOptions.subtitleOptions
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
            key: video.key,
            // Initialize with no thumbnail to prevent undefined checks later
            thumbnailUrl: undefined
          }));
          
          // Replace videos instead of adding to prevent duplicates
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
  
  if (isLoading || isLoadingProject || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <main className="min-h-screen pb-32">
      <div className="container mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Video-Editor
          </h1>

          {/* Workflow-Tipp statt Workflow Status */}
          <div className="mt-6 p-4 rounded-lg bg-blue-900/20 border border-blue-700/20 text-blue-400">
            <h3 className="font-medium">Workflow-Tipp</h3>
            <p className="mt-1">
              Hier kannst du dein Video generieren. Die ausgewählten Videoclips werden automatisch mit deinem Voiceover synchronisiert.
            </p>
          </div>
          
          {/* Error-Anzeige */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-600/30 rounded-md text-red-400">
              <div className="flex items-start">
                <ExclamationTriangleIcon className="h-5 w-5 mr-2 mt-0.5" />
                <div>
                  <h3 className="font-medium">{error}</h3>
                  {errorDetails && (
                    <div className="mt-2">
                      <p>{errorDetails.error}</p>
                      {errorDetails.details && (
                        <pre className="mt-2 p-2 bg-black/30 rounded text-xs overflow-auto">{JSON.stringify(errorDetails.details, null, 2)}</pre>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Video Preview */}
          {finalVideoUrl && finalVideoUrl !== 'generated' ? (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Deine Werbung</h2>
              <div className="bg-black rounded-xl overflow-hidden shadow-xl">
                {/* Video Player */}
                <video 
                  id="finalVideo"
                  className="w-full aspect-video"
                  src={signedVideoUrl || finalVideoUrl}
                  controls
                  poster="/video-poster.jpg"
                />
                
                {/* Video Controls */}
                <div className="p-4 bg-gray-900 flex justify-between items-center">
                  <div className="flex-1">
                    <div className="text-sm text-gray-400">
                      Dauer: {videoDuration.toFixed(1)} Sekunden
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={signedVideoUrl || finalVideoUrl}
                      download="meine-werbung.mp4"
                      className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                      Herunterladen
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Wenn noch kein fertiges Video vorhanden ist
            <div className="mb-8">
              
              {/* Matched Videos Info */}
              {fromScriptMatcher && matchedVideos.length > 0 && (
                <div className="mb-6 bg-gray-800/60 border border-gray-700 rounded-lg p-5">
                  <h3 className="font-medium mb-3 flex items-center">
                    <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
                    Ausgewählte Videos ({matchedVideos.length})
                  </h3>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {matchedVideos.map((match, idx) => {
                      const video = uploadedVideos.find(v => v.id === match.videoId);
                      return (
                        <VideoThumbnail key={idx} video={video} match={match} index={idx} />
                      );
                    })}
                  </div>
                </div>
              )}
              
              {/* Video Generation Options */}
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-5">
                <h3 className="font-medium mb-4">Video-Optionen</h3>
                
                {/* Generating state */}
                {isGenerating ? (
                  <div className="text-center py-8">
                    <div className="inline-block">
                      <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                      <div className="text-lg font-medium text-white/80">Video wird generiert...</div>
                      <div className="text-sm text-white/60 mt-1">{generationProgress.toFixed(0)}% abgeschlossen</div>
                      <div className="w-full h-3 bg-gray-700 rounded-full mt-3">
                        <div 
                          className="h-full bg-purple-600 rounded-full transition-all duration-300"
                          style={{ width: `${generationProgress}%` }}
                        ></div>
                      </div>
                      <div className="mt-4 text-sm text-white/60">
                        Dieser Vorgang kann einige Minuten dauern. Bitte warte, bis das Video fertig ist.
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Video Generation Form */}
                    <div className="space-y-5">
                      {/* Caption Option */}
                      <div className="space-y-5">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="addCaptions"
                            checked={addCaptions}
                            onChange={(e) => setAddCaptions(e.target.checked)}
                            className="w-4 h-4 bg-gray-700 border-gray-600 rounded focus:ring-blue-600 ring-offset-gray-800 focus:ring-2"
                          />
                          <label htmlFor="addCaptions" className="ml-2 text-sm font-medium">
                            Untertitel hinzufügen (automatisch generiert)
                          </label>
                        </div>
                        
                        {addCaptions && (
                          <div className="mt-4 p-3 bg-gray-800 rounded-md">
                            <h3 className="text-sm font-medium mb-3">Untertitel-Einstellungen</h3>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {/* Schriftart */}
                              <div>
                                <label htmlFor="subtitleFont" className="block text-xs font-medium">
                                  Schriftart
                                </label>
                                <select
                                  id="subtitleFont"
                                  value={subtitleOptions.fontName}
                                  onChange={(e) => setSubtitleOptions({...subtitleOptions, fontName: e.target.value})}
                                  className="mt-1 p-2 w-full text-sm rounded-md bg-gray-700 border-gray-600"
                                >
                                  <option value="Arial">Arial (Standard)</option>
                                  <option value="Helvetica">Helvetica</option>
                                  <option value="Verdana">Verdana</option>
                                  <option value="Georgia">Georgia</option>
                                  <option value="Courier">Courier</option>
                                  <option value="Times">Times</option>
                                </select>
                              </div>
                              
                              {/* Schriftgröße */}
                              <div>
                                <label htmlFor="subtitleSize" className="block text-xs font-medium">
                                  Schriftgröße
                                </label>
                                <select
                                  id="subtitleSize"
                                  value={subtitleOptions.fontSize}
                                  onChange={(e) => setSubtitleOptions({...subtitleOptions, fontSize: parseInt(e.target.value)})}
                                  className="mt-1 p-2 w-full text-sm rounded-md bg-gray-700 border-gray-600"
                                >
                                  {[18, 20, 22, 24, 26, 28, 30, 32, 36, 40].map(size => (
                                    <option key={size} value={size}>
                                      {size}px
                                    </option>
                                  ))}
                                </select>
                              </div>
                              
                              {/* Textfarbe */}
                              <div>
                                <label htmlFor="subtitleColor" className="block text-xs font-medium">
                                  Textfarbe
                                </label>
                                <div className="flex items-center mt-1">
                                  <input
                                    type="color"
                                    id="subtitleColor"
                                    value={subtitleOptions.primaryColor}
                                    onChange={(e) => setSubtitleOptions({...subtitleOptions, primaryColor: e.target.value})}
                                    className="h-8 w-8 rounded border border-gray-600"
                                  />
                                </div>
                              </div>
                              
                              {/* Hintergrundfarbe */}
                              <div>
                                <label htmlFor="subtitleBgColor" className="block text-xs font-medium">
                                  Hintergrundfarbe
                                </label>
                                <div className="flex items-center mt-1">
                                  <input
                                    type="color"
                                    id="subtitleBgColor"
                                    value={subtitleOptions.backgroundColor.substring(0, 7)}
                                    onChange={(e) => setSubtitleOptions({...subtitleOptions, backgroundColor: e.target.value + '80'})}
                                    className="h-8 w-8 rounded border border-gray-600"
                                  />
                                  <div className="text-xs text-white/50 ml-2">(mit 50% Transparenz)</div>
                                </div>
                              </div>
                              
                              {/* Position */}
                              <div>
                                <label htmlFor="subtitlePosition" className="block text-xs font-medium">
                                  Position
                                </label>
                                <select
                                  id="subtitlePosition"
                                  value={subtitleOptions.position}
                                  onChange={(e) => setSubtitleOptions({...subtitleOptions, position: e.target.value})}
                                  className="mt-1 p-2 w-full text-sm rounded-md bg-gray-700 border-gray-600"
                                >
                                  <option value="bottom">Unten (Standard)</option>
                                  <option value="top">Oben</option>
                                  <option value="middle">Mitte</option>
                                </select>
                              </div>
                            </div>
                            
                            <div className="mt-3 p-2 bg-gray-900 rounded border border-gray-700">
                              <div className="text-center text-xs">Vorschau</div>
                              <div 
                                className="mt-2 p-2 rounded text-center"
                                style={{
                                  fontFamily: subtitleOptions.fontName,
                                  fontSize: `${subtitleOptions.fontSize}px`,
                                  color: subtitleOptions.primaryColor,
                                  backgroundColor: subtitleOptions.backgroundColor.substring(0, 7) + '80',
                                  borderRadius: subtitleOptions.borderStyle === 4 ? '4px' : '0'
                                }}
                              >
                                Beispieltext für Untertitel
                              </div>
                            </div>
                          </div>
                        )}
                      
                        {/* Generate Video Button */}
                        <button
                          onClick={handleGenerateVideo}
                          disabled={isGenerating || selectedVideos.length === 0 || !voiceoverUrl}
                          className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-purple-500 text-white rounded-md hover:from-purple-500 hover:to-purple-400 disabled:opacity-50 font-medium flex items-center justify-center"
                        >
                          <SparklesIcon className="h-5 w-5 mr-2" />
                          Video generieren
                        </button>
                        
                        {(!selectedVideos.length || !voiceoverUrl) && (
                          <div className="text-yellow-500 text-sm mt-2">
                            <ExclamationTriangleIcon className="h-4 w-4 inline-block mr-1" />
                            {!selectedVideos.length ? 'Keine Videos ausgewählt. ' : ''}
                            {!voiceoverUrl ? 'Kein Voiceover gefunden. ' : ''}
                            {!selectedVideos.length || !voiceoverUrl ? 'Bitte gehe zurück zum Script-Matcher.' : ''}
                          </div>
                        )}
                      </div>
                      
                      {/* Back to Script Matcher Button */}
                      {(!fromScriptMatcher || selectedVideos.length === 0) && (
                        <div className="mt-6 text-center">
                          <Link
                            href="/script-matcher"
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                          >
                            <ArrowLeftIcon className="h-4 w-4 mr-2" />
                            Zurück zum Script-Matcher
                          </Link>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          
          {/* Project Information */}
          <div className="mt-12 text-center text-sm text-gray-500">
            {projectId && (
              <div>Projekt-ID: {projectId}</div>
            )}
            {jobId && (
              <div className="mt-1">Job-ID: {jobId}</div>
            )}
          </div>
        </div>
      </div>
    </main>
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