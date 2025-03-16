'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ArrowUpTrayIcon, ArrowRightIcon, CheckCircleIcon, FilmIcon, TagIcon, XMarkIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

// Vereinfachter Video-Typ
type UploadedVideo = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  tags: string[];
  key?: string;
}

export default function UploadPage() {
  const { data: session, status } = useSession()
  const [isLoading, setIsLoading] = useState(true)
  const [dragActive, setDragActive] = useState(false)
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([])
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState<{[key: string]: boolean}>({})
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({})
  const [pendingUploads, setPendingUploads] = useState<UploadedVideo[]>([])
  // Tag-related state
  const [currentTag, setCurrentTag] = useState('')
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)

  // Vereinfachte Authentifizierungs-Prüfung
  useEffect(() => {
    if (!isLoading && status !== 'loading') {
      if (status !== 'authenticated') {
        window.location.href = '/auth/signin?callbackUrl=/upload';
      }
    }
    setIsLoading(false);
  }, [status, isLoading]);

  // Videos aus der Datenbank laden
  useEffect(() => {
    async function loadVideos() {
      if (!session?.user?.id) return;
      
      try {
        const response = await fetch('/api/media')
        if (response.ok) {
          const data = await response.json()
          if (data.files?.length > 0) {
            // Stelle sicher, dass wir die signierten URLs verwenden
            const videos = data.files.map((video: any) => ({
              id: video.id,
              name: video.name,
              size: video.size,
              type: video.type,
              url: video.url, // Diese URL sollte bereits signiert sein
              tags: video.tags || [],
              key: video.key || video.path // Fallback auf path wenn key nicht existiert
            }));
            console.log('Loaded videos with signed URLs:', videos);
            setUploadedVideos(videos);
          } else {
            setUploadedVideos([])
          }
        }
      } catch (error) {
        console.error('Error loading videos:', error)
        setError('Failed to load videos')
      }
    }
    
    loadVideos()
  }, [session])

  // Vereinfachtes Drag & Drop
  function handleDrag(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files?.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  // Vereinfachter File-Upload
  async function handleFiles(files: FileList) {
    setError(null)
    
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('video/')) {
        setError('Only video files are allowed.')
        continue
      }
      
      if (file.size > 500 * 1024 * 1024) {
        setError(`File ${file.name} is too large. Maximum size is 500MB.`)
        continue
      }
      
      const videoId = crypto.randomUUID()
      const url = URL.createObjectURL(file)
      
      // Optimistisches UI-Update
      setPendingUploads(prev => [...prev, {
        id: videoId,
        name: file.name,
        size: file.size,
        type: file.type,
        url,
        tags: []
      }])
      
      setIsUploading(prev => ({ ...prev, [videoId]: true }))
      setUploadProgress(prev => ({ ...prev, [videoId]: 0 }))
      
      // Upload-Progress simulieren
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          const currentProgress = prev[videoId] || 0
          if (currentProgress >= 99) {
            clearInterval(progressInterval)
            return prev
          }
          return {
            ...prev,
            [videoId]: Math.min(currentProgress + 5, 99)
          }
        })
      }, 500)
      
      try {
        // Upload zur API
        const formData = new FormData()
        formData.append('file', file)
        formData.append('videoId', videoId)
        
        const response = await fetch('/api/upload-video', {
          method: 'POST',
          body: formData
        })
        
        if (!response.ok) {
          throw new Error('Upload failed')
        }
        
        // Upload erfolgreich
        clearInterval(progressInterval)
        setUploadProgress(prev => ({ ...prev, [videoId]: 100 }))
        setIsUploading(prev => ({ ...prev, [videoId]: false }))
        
        // Video-Liste aktualisieren
        const data = await response.json()
        setUploadedVideos(prev => [...prev, {
          id: videoId,
          name: file.name,
          size: file.size,
          type: file.type,
          url: data.url,
          tags: [],
          key: data.key
        }])
        
        // Pending Upload entfernen
        setPendingUploads(prev => prev.filter(v => v.id !== videoId))
        
      } catch (error) {
        clearInterval(progressInterval)
        console.error('Upload error:', error)
        setError(`Failed to upload ${file.name}`)
        setIsUploading(prev => ({ ...prev, [videoId]: false }))
        setPendingUploads(prev => prev.filter(v => v.id !== videoId))
      }
      
      URL.revokeObjectURL(url)
    }
  }

  // Tag management functions
  async function addTag(videoId: string) {
    if (!currentTag || currentTag.trim() === '') return
    
    const isPending = pendingUploads.some(video => video.id === videoId)
    
    if (isPending) {
      setPendingUploads(prev => prev.map(video => {
          if (video.id === videoId && !video.tags.includes(currentTag)) {
          return { ...video, tags: [...video.tags, currentTag] }
          }
        return video
      }))
    } else {
      try {
        const videoToUpdate = uploadedVideos.find(v => v.id === videoId)
        if (!videoToUpdate || videoToUpdate.tags.includes(currentTag)) return
        
        const newTags = [...videoToUpdate.tags, currentTag]
        
        const response = await fetch('/api/update-video-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId, tags: newTags })
        })
        
        if (!response.ok) throw new Error('Failed to update tags')
        
        setUploadedVideos(prev => prev.map(video => {
            if (video.id === videoId) {
            return { ...video, tags: newTags }
            }
          return video
        }))
      } catch (error) {
        console.error('Error updating tags:', error)
        setError('Failed to update tags')
      }
    }
    
    setCurrentTag('')
    setSelectedVideoId(null)
  }

  async function removeTag(videoId: string, tagToRemove: string) {
    const isPending = pendingUploads.some(video => video.id === videoId)
    
    if (isPending) {
      setPendingUploads(prev => prev.map(video => {
          if (video.id === videoId) {
          return { ...video, tags: video.tags.filter(tag => tag !== tagToRemove) }
          }
        return video
      }))
    } else {
      try {
        const videoToUpdate = uploadedVideos.find(v => v.id === videoId)
        if (!videoToUpdate) return
        
        const newTags = videoToUpdate.tags.filter(tag => tag !== tagToRemove)
        
        const response = await fetch('/api/update-video-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId, tags: newTags })
        })
        
        if (!response.ok) throw new Error('Failed to remove tag')
        
        setUploadedVideos(prev => prev.map(video => {
            if (video.id === videoId) {
            return { ...video, tags: newTags }
            }
          return video
        }))
      } catch (error) {
        console.error('Error removing tag:', error)
        setError('Failed to remove tag')
      }
    }
  }

  if (isLoading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!session) return null

  const allVideos = [...uploadedVideos, ...pendingUploads]

  return (
    <main className="container py-12 md:py-20">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
          Upload Your Videos
        </h1>
        <p className="mt-4 text-lg text-white/60">
          Upload video clips to use in your ad.
        </p>

        {/* Upload Area */}
        <div 
          className={`mt-8 border-2 border-dashed rounded-lg p-8 text-center ${
            dragActive ? 'border-primary bg-primary/5' : 'border-white/20 hover:border-white/40'
          } transition-colors`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-white/40" />
          <p className="mt-4 text-lg font-medium">
            Drag and drop your video files here
          </p>
          <p className="mt-2 text-white/60">
            or
          </p>
          <button
            onClick={() => inputRef.current?.click()}
            className="mt-4 px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
          >
            Select Files
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="video/*"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            className="hidden"
          />
          <p className="mt-4 text-sm text-white/40">
            Maximum file size: 500MB
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Videos Grid */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">
            Uploaded Videos{allVideos.length > 0 && ` (${allVideos.length})`}
          </h2>
          
          {allVideos.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              <FilmIcon className="h-12 w-12 mx-auto mb-2" />
              <p>No videos have been uploaded yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {allVideos.map((video) => (
                <div key={video.id} className="relative rounded-lg overflow-hidden bg-gray-800">
                  <video 
                    className="w-full h-full object-cover"
                    src={video.url}
                    controls
                    controlsList="nodownload"
                    preload="metadata"
                    playsInline
                    muted
                    crossOrigin="anonymous"
                    onError={(e) => {
                      console.error('Video loading error:', e);
                      const target = e.target as HTMLVideoElement;
                      if (target.error) {
                        console.error('Error code:', target.error.code);
                        console.error('Error message:', target.error.message);
                        console.error('Failed URL:', video.url);
                        
                        // Wenn es ein Upload in Bearbeitung ist, ignoriere den Fehler
                        if (uploadProgress[video.id] !== undefined && uploadProgress[video.id] < 100) {
                          return;
                        }
                        
                        // Setze einen Fehler-Status für dieses Video
                        setError(`Failed to load video: ${video.name}`);
                      }
                    }}
                    style={{ minHeight: '200px' }} // Mindesthöhe für bessere Darstellung
                  />
                  
                  {/* Upload Progress */}
                  {uploadProgress[video.id] !== undefined && uploadProgress[video.id] < 100 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
                      <div className="w-2/3 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${uploadProgress[video.id]}%` }}
                        />
                      </div>
                      <p className="mt-2 text-white text-sm">
                        Uploading... {Math.floor(uploadProgress[video.id])}%
                      </p>
                    </div>
                  )}
                  
                  {/* Upload Complete Indicator */}
                  {uploadProgress[video.id] === 100 && (
                    <div className="absolute top-2 right-2 bg-green-500/20 text-green-400 py-1 px-2 rounded-md flex items-center text-xs">
                      <CheckCircleIcon className="h-4 w-4 mr-1" />
                      Upload complete
                    </div>
                  )}

                  {/* Tags Section */}
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-black/80">
                    <div className="flex flex-wrap gap-1 mb-2">
                      {video.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="bg-purple-500/20 text-purple-300 text-xs px-2 py-1 rounded-full flex items-center"
                        >
                          {tag}
                          <button
                            onClick={() => removeTag(video.id, tag)}
                            className="ml-1 hover:text-white"
                          >
                            <XMarkIcon className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    
                    {selectedVideoId === video.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={currentTag}
                          onChange={(e) => setCurrentTag(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addTag(video.id)}
                          placeholder="Add tag..."
                          className="flex-1 bg-white/10 text-white text-sm rounded px-2 py-1"
                        />
                        <button
                          onClick={() => addTag(video.id)}
                          className="bg-purple-500 text-white px-2 py-1 rounded text-sm"
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setSelectedVideoId(video.id)}
                        className="text-white/60 text-sm flex items-center hover:text-white"
                      >
                        <TagIcon className="h-4 w-4 mr-1" />
                        Add Tag
                      </button>
                    )}
                  </div>

                  {/* Video Controls Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-black bg-opacity-50">
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm truncate">{video.name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Continue Button */}
        {allVideos.length > 0 && (
          <div className="mt-8 flex justify-end">
            <Link
              href="/editor"
              className="flex items-center bg-purple-600 hover:bg-purple-500 text-white py-2 px-4 rounded-lg"
            >
              Continue to Editor
              <ArrowRightIcon className="h-5 w-5 ml-2" />
            </Link>
          </div>
        )}
      </div>
    </main>
  )
} 