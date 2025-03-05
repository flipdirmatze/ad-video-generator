'use client'

import React, { useState, useEffect, useRef } from 'react'
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, PlayIcon, PauseIcon, ArrowPathIcon, FilmIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

type UploadedVideo = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  tags: string[];
}

type VideoSegment = {
  videoId: string;
  startTime: number;
  duration: number;
  position: number;
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
  const [generationProgress, setGenerationProgress] = useState(0)
  const [videoSegments, setVideoSegments] = useState<VideoSegment[]>([])
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
        setUploadedVideos(videos)
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
  }, [])

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
    if (!voiceoverUrl) {
      setError('No voiceover found. Please generate a voiceover first.')
      return
    }
    
    if (selectedVideos.length === 0) {
      setError('Please select at least one video clip.')
      return
    }
    
    setIsGenerating(true)
    setError(null)
    setGenerationProgress(0)
    
    try {
      // Get the selected videos
      const videosToUse = uploadedVideos.filter(video => selectedVideos.includes(video.id))
      
      // Create a progress interval
      const progressInterval = setInterval(() => {
        setGenerationProgress(prev => {
          const newProgress = prev + Math.random() * 5
          return newProgress >= 95 ? 95 : newProgress
        })
      }, 500)
      
      // Generate video segments (distribute videos across the duration)
      const totalDuration = 30 // Assume 30 seconds for the final video
      const segments: VideoSegment[] = []
      
      // Distribute videos across the duration
      let position = 0
      let remainingDuration = totalDuration
      
      // Assign segments to each selected video
      for (let i = 0; i < videosToUse.length; i++) {
        const video = videosToUse[i]
        const isLast = i === videosToUse.length - 1
        
        // For the last video, use all remaining duration
        // For others, use a portion based on how many videos are left
        const segmentDuration = isLast 
          ? remainingDuration 
          : Math.max(3, Math.floor(remainingDuration / (videosToUse.length - i)))
        
        segments.push({
          videoId: video.id,
          startTime: 0, // Start from the beginning of each clip
          duration: segmentDuration,
          position: position
        })
        
        position += segmentDuration
        remainingDuration -= segmentDuration
        
        if (remainingDuration <= 0) break
      }
      
      // Call the API to generate the final video
      const response = await fetch('/api/generate-final-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          voiceoverUrl,
          segments,
          videos: videosToUse.map(video => ({
            id: video.id,
            url: video.url
          }))
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to generate video')
      }
      
      const data = await response.json()
      
      // Clear the progress interval
      clearInterval(progressInterval)
      setGenerationProgress(100)
      
      // Save segments to localStorage
      localStorage.setItem('videoSegments', JSON.stringify(segments))
      setVideoSegments(segments)
      
      // Save the final video URL
      localStorage.setItem('finalVideoUrl', data.videoUrl)
      setFinalVideoUrl(data.videoUrl)
      
    } catch (err) {
      console.error('Error generating video:', err)
      setError('Failed to generate video. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

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
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <Link href="/upload" className="inline-flex items-center text-blue-600 hover:text-blue-800">
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          Back to Upload
        </Link>
        <h1 className="text-3xl font-bold mt-2">Video Editor</h1>
        <p className="text-gray-600 mt-2">Combine your voiceover with selected videos to create your final ad</p>
      </div>

      {/* Voiceover Preview */}
      {voiceoverUrl && (
        <div className="mb-8 p-4 bg-blue-50 rounded-lg">
          <h2 className="text-xl font-semibold mb-2">Your Voiceover</h2>
          <p className="text-gray-700 mb-4 text-sm italic">{voiceoverScript}</p>
          <audio 
            controls 
            className="w-full" 
            src={voiceoverUrl}
            ref={audioRef}
          />
        </div>
      )}

      {/* Video Selection */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Select Videos for Your Ad</h2>
        
        {uploadedVideos.length === 0 ? (
          <div className="text-center p-8 bg-gray-50 rounded-lg">
            <p className="text-gray-500 mb-4">No videos uploaded yet</p>
            <Link href="/upload" className="btn btn-primary">
              Upload Videos
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {uploadedVideos.map(video => (
              <div 
                key={video.id} 
                className={`border rounded-lg overflow-hidden ${
                  selectedVideos.includes(video.id) ? 'border-blue-500 ring-2 ring-blue-300' : 'border-gray-200'
                }`}
              >
                <video 
                  src={video.url} 
                  className="w-full h-40 object-cover bg-gray-100" 
                  onClick={() => toggleVideoSelection(video.id)}
                />
                <div className="p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium truncate">{video.name}</h3>
                      <p className="text-sm text-gray-500">{formatFileSize(video.size)}</p>
                    </div>
                    <button 
                      onClick={() => toggleVideoSelection(video.id)}
                      className={`p-1 rounded-full ${
                        selectedVideos.includes(video.id) 
                          ? 'bg-blue-100 text-blue-600' 
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      <CheckCircleIcon className="h-6 w-6" />
                    </button>
                  </div>
                  
                  {video.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {video.tags.map(tag => (
                        <span key={tag} className="px-2 py-1 bg-gray-100 text-xs rounded-full">
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

      {/* Video Generation */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Generate Your Ad</h2>
          <button
            onClick={handleGenerateVideo}
            disabled={isGenerating || selectedVideos.length === 0 || !voiceoverUrl}
            className={`btn ${
              isGenerating || selectedVideos.length === 0 || !voiceoverUrl
                ? 'btn-disabled'
                : 'btn-primary'
            }`}
          >
            {isGenerating ? (
              <>
                <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>Generate Ad</>
            )}
          </button>
        </div>

        {error && (
          <div className="p-4 mb-4 bg-red-50 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {isGenerating && (
          <div className="mb-6">
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 transition-all duration-300 ease-out"
                style={{ width: `${generationProgress}%` }}
              ></div>
            </div>
            <p className="text-sm text-gray-600 mt-2">
              {generationProgress < 30 && "Analyzing videos and voiceover..."}
              {generationProgress >= 30 && generationProgress < 60 && "Creating video segments..."}
              {generationProgress >= 60 && generationProgress < 90 && "Combining audio and video..."}
              {generationProgress >= 90 && "Finalizing your ad..."}
            </p>
          </div>
        )}

        {/* Video Segments Visualization */}
        {videoSegments.length > 0 && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium mb-2">Video Segments</h3>
            <div className="relative h-12 bg-gray-200 rounded-lg overflow-hidden mb-2">
              {videoSegments.map((segment, index) => {
                const video = uploadedVideos.find(v => v.id === segment.videoId);
                const startPercent = (segment.position / 30) * 100;
                const widthPercent = (segment.duration / 30) * 100;
                
                return (
                  <div
                    key={index}
                    className="absolute h-full flex items-center justify-center text-xs text-white overflow-hidden"
                    style={{
                      left: `${startPercent}%`,
                      width: `${widthPercent}%`,
                      backgroundColor: getColorForIndex(index),
                    }}
                    title={`${video?.name || 'Video'} (${segment.duration.toFixed(1)}s)`}
                  >
                    <span className="truncate px-1">
                      {widthPercent > 10 ? (video?.name || `Clip ${index + 1}`) : ''}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>0s</span>
              <span>15s</span>
              <span>30s</span>
            </div>
            <p className="text-sm text-gray-600 mt-4">
              <FilmIcon className="h-4 w-4 inline mr-1" />
              Your ad combines {videoSegments.length} video segments with your voiceover.
            </p>
          </div>
        )}

        {/* Final Video Preview */}
        {finalVideoUrl && (
          <div className="bg-gray-900 rounded-lg overflow-hidden">
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
                      <button className="bg-white/20 backdrop-blur-sm p-4 rounded-full">
                        <PlayIcon className="h-8 w-8 text-white" />
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
            
            <div className="p-4 bg-gray-800 text-white">
              <h3 className="font-medium mb-2">Your Generated Ad</h3>
              <p className="text-gray-300 text-sm mb-4">
                This is a preview of your ad with the voiceover combined with your selected videos.
              </p>
              <div className="flex space-x-2">
                <button 
                  className="btn btn-sm btn-primary"
                  onClick={togglePlay}
                >
                  {isPlaying ? (
                    <>
                      <PauseIcon className="h-4 w-4 mr-1" />
                      Pause
                    </>
                  ) : (
                    <>
                      <PlayIcon className="h-4 w-4 mr-1" />
                      Play
                    </>
                  )}
                </button>
                <button className="btn btn-sm btn-outline">
                  Download
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* How It Works */}
      <div className="mt-12 p-6 bg-gray-50 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">How Video Generation Works</h2>
        <div className="space-y-4">
          <div className="flex">
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
              1
            </div>
            <div>
              <h3 className="font-medium">Select Your Videos</h3>
              <p className="text-gray-600">Choose one or more videos from your uploaded content to include in your ad.</p>
            </div>
          </div>
          
          <div className="flex">
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
              2
            </div>
            <div>
              <h3 className="font-medium">Generate Your Ad</h3>
              <p className="text-gray-600">Our system combines your voiceover with the selected videos, distributing them evenly across the duration.</p>
            </div>
          </div>
          
          <div className="flex">
            <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
              3
            </div>
            <div>
              <h3 className="font-medium">Preview and Download</h3>
              <p className="text-gray-600">Preview your generated ad and download it for use in your marketing campaigns.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper function to get a color for a segment based on its index
function getColorForIndex(index: number): string {
  const colors = [
    '#3B82F6', // blue-500
    '#10B981', // emerald-500
    '#F59E0B', // amber-500
    '#EF4444', // red-500
    '#8B5CF6', // violet-500
    '#EC4899', // pink-500
    '#06B6D4', // cyan-500
  ];
  
  return colors[index % colors.length];
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
} 