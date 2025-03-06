'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, PlayIcon, PauseIcon, ArrowPathIcon, FilmIcon, SpeakerWaveIcon, ExclamationTriangleIcon, XMarkIcon, SparklesIcon, ClockIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

type UploadedVideo = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  tags: string[];
  filepath?: string;
}

type VideoSegment = {
  videoId: string;
  startTime: number;
  duration: number;
  position: number;
}

// Define error response type to match the backend
type ErrorResponse = {
  error: string;
  code: string;
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
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null)
  const [voiceoverScript, setVoiceoverScript] = useState<string>('')
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([])
  const [selectedVideos, setSelectedVideos] = useState<string[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<ErrorResponse | null>(null)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [videoSegments, setVideoSegments] = useState<VideoSegment[]>([])
  const [availableUploads, setAvailableUploads] = useState<FileInfo[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)

  // Load data from localStorage on component mount
  useEffect(() => {
    const savedVoiceover = localStorage.getItem('voiceoverUrl')
    const savedScript = localStorage.getItem('voiceoverScript')
    const savedVideos = localStorage.getItem('uploadedVideos')
    const savedFinalVideo = localStorage.getItem('finalVideoUrl')
    const savedSegments = localStorage.getItem('videoSegments')
    
    if (savedVoiceover) {
      setVoiceoverUrl(savedVoiceover)
    }
    
    if (savedScript) {
      setVoiceoverScript(savedScript)
    }
    
    if (savedVideos) {
      try {
        const videos = JSON.parse(savedVideos)
        // Add filepath property for uploaded videos if not present
        const updatedVideos = videos.map((video: UploadedVideo) => {
          if (!video.filepath && video.url.startsWith('blob:')) {
            // For videos with blob URLs, we need to check if they're also uploaded to the server
            // This is a placeholder, in practice you might derive the filepath from the video ID
            const possibleFilepath = `/uploads/${video.id}.mp4`;
            return {
              ...video,
              filepath: possibleFilepath
            };
          }
          return video;
        });
        setUploadedVideos(updatedVideos)
      } catch (e) {
        console.error('Error parsing saved videos:', e)
      }
    }
    
    if (savedFinalVideo) {
      setFinalVideoUrl(savedFinalVideo)
    }

    if (savedSegments) {
      try {
        setVideoSegments(JSON.parse(savedSegments))
      } catch (e) {
        console.error('Error parsing saved segments:', e)
      }
    }
    
    // Fetch available uploads from the server
    fetchAvailableUploads();
  }, [])

  // Function to fetch available uploads from the server
  const fetchAvailableUploads = async () => {
    try {
      const response = await fetch('/api/list-uploads');
      if (response.ok) {
        const data = await response.json();
        console.log('Available uploads:', data);
        
        // Update the state with file objects instead of just filenames
        if (data.files && data.files.length > 0) {
          setAvailableUploads(data.files);
          
          // Update video filepaths with actual server files if they exist
          setUploadedVideos(prev => {
            return prev.map(video => {
              // Try to find a matching file in the uploads directory
              // First try by exact ID match
              const matchByExactId = data.files.find((file: any) => 
                file.id === video.id
              );
              
              // Then try by ID prefix in filename
              const matchByFileName = !matchByExactId && data.files.find((file: any) => 
                file.name.startsWith(video.id) || 
                video.filepath === `/uploads/${file.name}`
              );
              
              const matchingFile = matchByExactId || matchByFileName;
              
              if (matchingFile) {
                return {
                  ...video,
                  filepath: matchingFile.path
                };
              }
              return video;
            });
          });
        }
      } else {
        console.error('Failed to fetch available uploads');
      }
    } catch (error) {
      console.error('Error fetching available uploads:', error);
    }
  };

  // Toggle video selection
  const toggleVideoSelection = (videoId: string) => {
    setSelectedVideos(prev => {
      if (prev.includes(videoId)) {
        return prev.filter(id => id !== videoId)
      } else {
        return [...prev, videoId]
      }
    })
  }

  // Generate final video
  const handleGenerateVideo = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setError(null);
    setErrorDetails(null);
    
    try {
      // Erstellen der Anfrage
      const finalVideo = localStorage.getItem('finalVideo');
      const finalVideoData = finalVideo ? JSON.parse(finalVideo) : null;
      
      // Wenn keine Timeline-Daten vorhanden sind, verwenden Sie die Standardeinstellungen
      const timelineData = finalVideoData?.timelineData || {
        segments: []
      };
      
      // Automatisch Segmente erstellen, wenn keine vorhanden sind
      if (timelineData.segments.length === 0 && selectedVideos.length > 0) {
        console.log("Keine Segmente gefunden. Erstelle automatisch Segmente für ausgewählte Videos.");
        
        // Erstelle ein Segment für jedes ausgewählte Video
        let position = 0;
        const autoSegments = selectedVideos.map(videoId => {
          // Finde das Video
          const video = uploadedVideos.find(v => v.id === videoId);
          
          // Standardmäßig 3 Sekunden pro Segment, kann angepasst werden
          const duration = 3;
          
          // Erstelle das Segment
          const segment = {
            videoId,
            startTime: 0, // Start vom Anfang des Videos
            duration, // 3 Sekunden pro Segment
            position // Position in der Timeline
          };
          
          // Aktualisiere die Position für das nächste Segment
          position += duration;
          
          return segment;
        });
        
        // Aktualisiere die Timeline mit den neuen Segmenten
        timelineData.segments = autoSegments;
        
        // Speichere die Segmente im localStorage für die nächste Sitzung
        setVideoSegments(autoSegments);
        localStorage.setItem('videoSegments', JSON.stringify(autoSegments));
        
        // Aktualisiere auch das finalVideo-Objekt im localStorage
        if (finalVideoData) {
          finalVideoData.timelineData = timelineData;
          localStorage.setItem('finalVideo', JSON.stringify(finalVideoData));
        } else {
          localStorage.setItem('finalVideo', JSON.stringify({ timelineData }));
        }
      }
      
      // Sammeln Sie alle benötigten Videos für die Anfrage
      const usedVideoIds = new Set(timelineData.segments.map((s: any) => s.videoId));
      const videoList = Array.from(usedVideoIds).map(id => {
        const video = uploadedVideos.find(v => v.id === id);
        return {
          id,
          url: video ? (video.filepath || video.url) : `/uploads/${id}.mp4` // Nutze filepath oder url als Fallback
        };
      });
      
      // Versuche zuerst, das Voiceover-Objekt aus dem localStorage zu lesen
      let voiceoverUrl = null;
      
      // Versuche zuerst das 'voiceover'-Objekt
      const voiceoverObj = localStorage.getItem('voiceover');
      if (voiceoverObj) {
        try {
          const parsedVoiceover = JSON.parse(voiceoverObj);
          if (parsedVoiceover && parsedVoiceover.url) {
            voiceoverUrl = parsedVoiceover.url;
          }
        } catch (e) {
          console.warn('Failed to parse voiceover object:', e);
        }
      }
      
      // Wenn nicht gefunden, versuche direkt 'voiceoverUrl'
      if (!voiceoverUrl) {
        voiceoverUrl = localStorage.getItem('voiceoverUrl');
      }
      
      // Validierung
      if (!voiceoverUrl) {
        setError('No voiceover found. Please generate a voiceover first.');
        setIsGenerating(false);
        return;
      }
      
      if (timelineData.segments.length === 0) {
        setError('No video segments defined. Please add at least one video to the timeline.');
        setIsGenerating(false);
        return;
      }
      
      const requestData = {
        voiceoverUrl: voiceoverUrl,
        segments: timelineData.segments,
        videos: videoList
      };
      
      console.log("Sending request data:", requestData);
      
      // Senden der Anfrage
      const response = await fetch('/api/generate-final-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });
      
      // Fehlerbehandlung
      if (!response.ok) {
        try {
          const errorData = await response.json() as ErrorResponse;
          console.error('API Error:', errorData);
          setErrorDetails(errorData);
          
          // Create a detailed error message with suggestions if available
          let errorMessage = errorData.error || 'Failed to generate video';
          
          // Add specific details for certain error codes
          if (errorData.code === 'NO_VALID_SEGMENTS') {
            errorMessage += '\n\n';
            if (errorData.details?.errors) {
              const durationErrors = errorData.details.errors.filter((e: any) => 
                e.error?.includes('duration') || e.error?.includes('exceeds'));
              
              if (durationErrors && durationErrors.length > 0) {
                errorMessage += '⚠️ Video duration issues:\n';
                errorMessage += 'Your videos are shorter than the selected durations in the timeline.\n';
                errorMessage += 'Try reducing the segment durations or selecting different videos.\n\n';
              }
            }
            
            if (errorData.suggestions) {
              errorMessage += 'Suggestions:\n• ' + errorData.suggestions.join('\n• ');
            }
          } else if (errorData.code === 'BLOB_URLS_NOT_SUPPORTED') {
            errorMessage = 'Videos must be uploaded to the server first. Please use the Upload page to upload your videos.';
          }
          
          setError(errorMessage);
        } catch (parseError) {
          console.error('Error parsing response:', parseError);
          setError('Failed to generate video. Please try again.');
        }
        
        setIsGenerating(false);
        return;
      }
      
      // Erfolgreiche Antwort verarbeiten
      const responseData = await response.json();
      setFinalVideoUrl(responseData.videoUrl || responseData.url);
      setGenerationProgress(100);
      
      // Speichern Sie die generierte Video-URL in localStorage
      if (finalVideoData) {
        finalVideoData.url = responseData.videoUrl || responseData.url;
        finalVideoData.generatedAt = new Date().toISOString();
        localStorage.setItem('finalVideo', JSON.stringify(finalVideoData));
        
        // Aktualisieren Sie den Workflow-Status
        const workflowStatus = JSON.parse(localStorage.getItem('workflowStatus') || '{}');
        workflowStatus.finalVideo = true;
        localStorage.setItem('workflowStatus', JSON.stringify(workflowStatus));
      }
      
      // Speichern Sie die URL auch in einem separaten localStorage-Element für andere Seiten
      localStorage.setItem('finalVideoUrl', responseData.videoUrl || responseData.url);
      
      // Wenn es Warnungen gibt, zeigen Sie sie an
      if (responseData.warnings) {
        console.warn('Video generation warnings:', responseData.warnings);
      }
      
      setIsGenerating(false);
    } catch (error) {
      console.error('Error generating video:', error);
      setError(`Failed to generate video: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsGenerating(false);
    }
  };

  // Handle playback of the final video
  useEffect(() => {
    if (!finalVideoUrl || finalVideoUrl !== 'generated' || !videoSegments.length) return
    
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
    const uniqueVideoIds = [...new Set(videoSegments.map(segment => segment.videoId))]
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
    
    // Function to start playback
    const startPlayback = () => {
      if (!audio) return
      
      // Reset canvas
      if (ctx) {
        ctx.fillStyle = 'black'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }
      
      // Start audio
      audio.currentTime = 0
      audio.play()
      
      // Set playing state
      setIsPlaying(true)
      
      // Start animation loop
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      
      // Animation function
      const animate = () => {
        if (!audio || !ctx) return
        
        const currentTime = audio.currentTime
        
        // Find the current segment
        const currentSegment = videoSegments.find(segment => 
          currentTime >= segment.position && 
          currentTime < segment.position + segment.duration
        )
        
        if (currentSegment) {
          const videoElement = videoElements[currentSegment.videoId]
          if (videoElement) {
            // Calculate time within the source video
            const videoTime = currentSegment.startTime + (currentTime - currentSegment.position)
            
            // Seek to the correct time in the video
            if (Math.abs(videoElement.currentTime - videoTime) > 0.2) {
              videoElement.currentTime = videoTime
            }
            
            // Draw the current frame
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
          }
        } else {
          // If no segment found, show black
          ctx.fillStyle = 'black'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
        
        // Continue animation if still playing
        if (!audio.paused && !audio.ended) {
          animationRef.current = requestAnimationFrame(animate)
        } else {
          setIsPlaying(false)
        }
      }
      
      // Start animation
      animationRef.current = requestAnimationFrame(animate)
    }
    
    // Function to stop playback
    const stopPlayback = () => {
      if (!audio) return
      
      audio.pause()
      setIsPlaying(false)
      
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
    
    // Clean up function
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      
      if (audio) {
        audio.pause()
      }
      
      // Clean up video elements
      Object.values(videoElements).forEach(video => {
        video.pause()
        video.src = ''
      })
    }
  }, [finalVideoUrl, videoSegments, uploadedVideos, voiceoverUrl])

  // Toggle play/pause for the final video
  const togglePlay = () => {
    if (finalVideoUrl === 'generated') {
      // For canvas-based playback
      const audio = audioRef.current
      if (!audio) return
      
      if (isPlaying) {
        audio.pause()
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
          animationRef.current = null
        }
        setIsPlaying(false)
      } else {
        // If audio ended, restart from beginning
        if (audio.ended) {
          audio.currentTime = 0
        }
        
        // Start playback
        audio.play()
        setIsPlaying(true)
        
        // Animation will be handled by the useEffect
      }
    } else if (videoRef.current) {
      // For regular video element
      if (isPlaying) {
        videoRef.current.pause()
      } else {
        videoRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  // Handle video play/pause events for regular video
  const handleVideoEvents = () => {
    const videoElement = videoRef.current
    if (videoElement) {
      videoElement.onplay = () => setIsPlaying(true)
      videoElement.onpause = () => setIsPlaying(false)
      videoElement.onended = () => setIsPlaying(false)
    }
  }

  // Set up video event listeners
  useEffect(() => {
    if (finalVideoUrl && finalVideoUrl !== 'generated') {
      handleVideoEvents()
    }
  }, [finalVideoUrl])

  // Check if we have all required components
  const hasVoiceover = !!voiceoverUrl
  const hasVideos = uploadedVideos.length > 0

  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-secondary text-white p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold">Video Editor</h1>
          <p className="mt-2 opacity-80">Combine your videos and add a voiceover</p>
        </div>
      </div>
      
      {/* Warning about uploading videos first */}
      <div className="max-w-7xl mx-auto p-4 mt-4">
        <div className="alert alert-warning shadow-lg">
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            <span>
              <strong>Wichtig:</strong> Videos müssen zuerst auf der <Link href="/upload" className="underline font-bold">Upload-Seite</Link> hochgeladen werden, bevor sie hier kombiniert werden können. Blob-URLs können nicht serverseitig verarbeitet werden.
            </span>
          </div>
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
                    {availableUploads.map((file: any) => (
                      <div key={file.name} className="badge badge-success gap-1 p-3">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75l3 3m0 0l3-3m-3 3v-7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {file.name} {file.id && <span className="text-xs ml-1">({file.id})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Videos that will not work warning */}
        {uploadedVideos.some(video => {
          // For each selected video, check if there's a matching file on the server
          return selectedVideos.includes(video.id) && 
                 !availableUploads.some((file: any) => 
                   file.id === video.id || // Check by ID
                   file.name.startsWith(video.id) || // Check by ID prefix
                   (video.filepath && video.filepath === file.path) // Check by path
                 );
        }) && (
          <div className="mb-6">
            <div className="alert alert-warning shadow-lg">
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div>
                  <div className="font-bold">Achtung: Einige ausgewählte Videos sind nicht auf dem Server verfügbar!</div>
                  <div className="mt-2">
                    <p>Die folgenden Videos müssen zuerst über die Upload-Seite hochgeladen werden:</p>
                    <ul className="list-disc list-inside mt-1">
                      {uploadedVideos
                        .filter(video => {
                          return selectedVideos.includes(video.id) && 
                                 !availableUploads.some((file: any) => 
                                   file.id === video.id || 
                                   file.name.startsWith(video.id) || 
                                   (video.filepath && video.filepath === file.path)
                                 );
                        })
                        .map(video => (
                          <li key={video.id} className="text-sm">{video.name} (ID: {video.id})</li>
                        ))
                      }
                    </ul>
                    <Link href="/upload" className="btn btn-sm btn-warning mt-3">Zur Upload-Seite</Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-1">
            {/* Voiceover Preview */}
            {voiceoverUrl ? (
              <div className="mb-8 card-gradient p-6 rounded-xl">
                <div className="flex items-center mb-4">
                  <SpeakerWaveIcon className="h-6 w-6 text-primary mr-2" />
                  <h2 className="text-xl font-semibold">Your Voiceover</h2>
                </div>
                
                {voiceoverScript && (
                  <div className="mb-4 p-4 bg-white/5 rounded-lg">
                    <p className="text-white/80 italic">"{voiceoverScript}"</p>
                  </div>
                )}
                
                <audio 
                  controls 
                  className="w-full rounded-lg" 
                  src={voiceoverUrl}
                  ref={audioRef}
                />
              </div>
            ) : (
              <div className="mb-8 card-gradient p-6 rounded-xl text-center">
                <div className="flex flex-col items-center mb-4">
                  <SpeakerWaveIcon className="h-12 w-12 text-primary/50 mb-3" />
                  <h2 className="text-xl font-semibold">No Voiceover Found</h2>
                  <p className="text-white/60 mt-2">You need to create a voiceover before generating your ad.</p>
                </div>
                <Link 
                  href="/voiceover" 
                  className="inline-flex items-center px-5 py-2.5 mt-2 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-lg shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transform hover:scale-105 transition-all duration-300"
                >
                  Create Voiceover
                  <ArrowRightIcon className="ml-2 h-4 w-4" />
                </Link>
              </div>
            )}

            {/* Video Selection */}
            <div className="mb-8">
              <div className="flex items-center mb-4">
                <FilmIcon className="h-6 w-6 text-primary mr-2" />
                <h2 className="text-xl font-semibold">Select Videos for Your Ad</h2>
              </div>
              
              {uploadedVideos.length === 0 ? (
                <div className="text-center p-8 card-gradient rounded-xl">
                  <FilmIcon className="h-12 w-12 text-primary/50 mx-auto mb-3" />
                  <p className="text-white/60 mb-4">No videos uploaded yet</p>
                  <Link 
                    href="/upload" 
                    className="inline-flex items-center px-5 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-lg shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transform hover:scale-105 transition-all duration-300"
                  >
                    Upload Videos
                    <ArrowRightIcon className="ml-2 h-4 w-4" />
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {uploadedVideos.map(video => (
                    <div 
                      key={video.id} 
                      className={`card-gradient rounded-xl overflow-hidden transform transition-all duration-300 hover:scale-102 ${
                        selectedVideos.includes(video.id) ? 'ring-2 ring-primary' : ''
                      }`}
                    >
                      <video 
                        src={video.url} 
                        className="w-full h-40 object-cover bg-gray-900" 
                        onClick={() => toggleVideoSelection(video.id)}
                      />
                      <div className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium truncate text-white">{video.name}</h3>
                            <p className="text-sm text-white/60">{formatFileSize(video.size)}</p>
                          </div>
                          <button 
                            onClick={() => toggleVideoSelection(video.id)}
                            className={`p-1.5 rounded-full transition-all duration-300 ${
                              selectedVideos.includes(video.id) 
                                ? 'bg-primary/20 text-primary' 
                                : 'bg-white/10 text-white/40 hover:bg-white/20'
                            }`}
                          >
                            <CheckCircleIcon className="h-6 w-6" />
                          </button>
                        </div>
                        
                        {video.tags.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {video.tags.map(tag => (
                              <span key={tag} className="px-2 py-0.5 bg-white/10 text-white/70 text-xs rounded-full">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="col-span-2">
            {/* Video Generation */}
            <div className="mb-8 card-gradient p-6 rounded-xl">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center">
                  <SparklesIcon className="h-6 w-6 text-primary mr-2" />
                  <h2 className="text-xl font-semibold">Generate Your Ad</h2>
                </div>
                <button
                  onClick={handleGenerateVideo}
                  disabled={isGenerating || selectedVideos.length === 0 || !voiceoverUrl}
                  className={`inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 ${
                    isGenerating || selectedVideos.length === 0 || !voiceoverUrl
                      ? 'bg-white/10 text-white/40 cursor-not-allowed'
                      : 'bg-gradient-to-r from-primary to-primary-light text-white shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transform hover:scale-105'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="h-5 w-5 mr-2" />
                      Generate Ad
                    </>
                  )}
                </button>
              </div>

              {/* Add warning if blob URLs are detected */}
              {selectedVideos.length > 0 && 
               uploadedVideos.filter(v => selectedVideos.includes(v.id) && v.url.startsWith('blob:') && !v.filepath).length > 0 && (
                <div className="mb-4 p-4 bg-amber-50/20 border border-amber-200/30 rounded-lg">
                  <div className="flex items-start">
                    <ExclamationTriangleIcon className="h-6 w-6 text-amber-500 mr-3 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-lg font-semibold text-amber-300 mb-2">Some selected videos need to be uploaded</h3>
                      <p className="text-amber-200/80">
                        One or more selected videos are temporary blob URLs that cannot be processed on the server.
                        Please use the Upload page first to upload these videos to the server.
                      </p>
                      <div className="mt-3">
                        <Link
                          href="/upload"
                          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-amber-600 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300"
                        >
                          Go to Upload Page
                          <ArrowRightIcon className="ml-2 h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg glass-error">
                  <div className="flex items-start">
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-lg font-semibold text-red-800 mb-2">Error</h3>
                      <div className="text-red-700">{error}</div>
                      
                      {errorDetails?.suggestions && errorDetails.suggestions.length > 0 && (
                        <div className="mt-3">
                          <h4 className="text-sm font-semibold text-red-800 mb-1">Troubleshooting suggestions:</h4>
                          <ul className="list-disc pl-5 text-sm text-red-700">
                            {errorDetails.suggestions.map((suggestion, index) => (
                              <li key={index}>{suggestion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {errorDetails?.code && (
                        <div className="mt-2 text-xs text-red-600">
                          Error code: {errorDetails.code}
                        </div>
                      )}
                    </div>
                  </div>
                  <button 
                    className="mt-3 text-sm text-red-600 hover:text-red-800 flex items-center"
                    onClick={() => {
                      setError(null);
                      setErrorDetails(null);
                    }}
                  >
                    <XMarkIcon className="h-4 w-4 mr-1" />
                    Dismiss
                  </button>
                </div>
              )}

              {isGenerating && (
                <div className="mb-6">
                  <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-primary to-primary-light transition-all duration-300 ease-out animate-pulse-slow"
                      style={{ width: `${generationProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm text-white/70 mt-3 flex items-center">
                    <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                    {generationProgress < 30 && "Analyzing videos and voiceover..."}
                    {generationProgress >= 30 && generationProgress < 60 && "Creating video segments..."}
                    {generationProgress >= 60 && generationProgress < 90 && "Combining audio and video..."}
                    {generationProgress >= 90 && "Finalizing your ad..."}
                  </p>
                </div>
              )}

              {/* Video Segments Visualization */}
              {videoSegments.length > 0 && (
                <div className="mb-6 p-5 bg-white/5 rounded-lg border border-white/10">
                  <h3 className="font-medium mb-3 flex items-center">
                    <FilmIcon className="h-5 w-5 text-primary mr-2" />
                    Video Timeline
                  </h3>
                  <div className="relative h-14 bg-white/5 rounded-lg overflow-hidden mb-2">
                    {videoSegments.map((segment, index) => {
                      const video = uploadedVideos.find(v => v.id === segment.videoId);
                      const startPercent = (segment.position / 30) * 100;
                      const widthPercent = (segment.duration / 30) * 100;
                      
                      return (
                        <div
                          key={index}
                          className="absolute h-full flex items-center justify-center text-xs text-white overflow-hidden transition-all duration-300 hover:brightness-110 hover:z-10"
                          style={{
                            left: `${startPercent}%`,
                            width: `${widthPercent}%`,
                            backgroundColor: getColorForIndex(index),
                          }}
                          title={`${video?.name || 'Video'} (${segment.duration.toFixed(1)}s)`}
                        >
                          <span className="truncate px-2 font-medium">
                            {widthPercent > 10 ? (video?.name || `Clip ${index + 1}`) : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-xs text-white/40">
                    <span>0s</span>
                    <span>15s</span>
                    <span>30s</span>
                  </div>
                  <p className="text-sm text-white/70 mt-4 flex items-center">
                    <FilmIcon className="h-4 w-4 mr-2 text-primary" />
                    Your ad combines {videoSegments.length} video segments with your voiceover.
                  </p>
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
                        className="w-full h-full" 
                        controls
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onEnded={() => setIsPlaying(false)}
                        onTimeUpdate={handleVideoEvents}
                      >
                        <source src={finalVideoUrl} type="video/mp4" />
                        Your browser does not support the video tag.
                      </video>
                    )}
                  </div>
                  
                  <div className="p-5 bg-white/5">
                    <h3 className="font-medium mb-2 flex items-center">
                      <SparklesIcon className="h-5 w-5 text-primary mr-2" />
                      Your Generated Ad
                    </h3>
                    <p className="text-white/70 text-sm mb-4">
                      This is a preview of your ad with the voiceover combined with your selected videos.
                    </p>
                    <div className="flex flex-wrap gap-3">
                      <a 
                        href={finalVideoUrl}
                        download="my-ad-video.mp4"
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-lg shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transform hover:scale-105 transition-all duration-300"
                      >
                        Download Video
                      </a>
                      <button
                        onClick={() => {
                          setFinalVideoUrl(null);
                          localStorage.removeItem('finalVideoUrl');
                        }}
                        className="inline-flex items-center px-4 py-2 text-sm font-medium text-white/70 bg-white/10 rounded-lg hover:bg-white/20 transition-all duration-300"
                      >
                        Create New Video
                      </button>
                    </div>
                  </div>
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