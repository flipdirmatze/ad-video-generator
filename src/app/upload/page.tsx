'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ArrowUpTrayIcon, XMarkIcon, TagIcon, ArrowRightIcon, CheckCircleIcon, FilmIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

// Definiere den Typ für hochgeladene Videos
type UploadedVideo = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
  tags: string[];
  filepath?: string;
  key?: string; // S3 key for the file
}

// S3-Bucket-Ordner-Typ
type S3Folder = 'uploads' | 'processed' | 'final' | 'audio';

export default function UploadPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)

  // State management for drag and drop functionality
  const [dragActive, setDragActive] = useState(false)
  // Store all uploaded videos
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([])
  // Current tag being added
  const [currentTag, setCurrentTag] = useState('')
  // Track which video is selected for tag editing
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  // Error message handling
  const [error, setError] = useState<string | null>(null)
  // Reference to hidden file input
  const inputRef = useRef<HTMLInputElement>(null)
  // Maximum allowed file size (500MB)
  const MAX_FILE_SIZE = 500 * 1024 * 1024
  const [isUploading, setIsUploading] = useState<{[key: string]: boolean}>({})
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({})

  // HOOK 1: Authentifizierungs-Check und Redirect
  useEffect(() => {
    if (!isLoading && status !== 'loading') {
      if (status !== 'authenticated') {
        router.push('/auth/signin?callbackUrl=/upload')
      }
    }
    setIsLoading(false)
  }, [status, isLoading, router])

  // HOOK 2: Videos aus localStorage laden
  useEffect(() => {
    const savedVideos = localStorage.getItem('uploadedVideos')
    if (savedVideos) {
      try {
        setUploadedVideos(JSON.parse(savedVideos))
      } catch (e) {
        console.error('Error parsing saved videos:', e)
      }
    }
  }, [])

  // HOOK 3: Videos in localStorage speichern
  useEffect(() => {
    if (uploadedVideos.length > 0) {
      localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos))
    }
  }, [uploadedVideos])

  // Zeige Ladeindikator während der Authentifizierung
  if (isLoading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  // Wenn nicht authentifiziert, nichts rendern (Weiterleitung erfolgt durch useEffect)
  if (!session) {
    return null
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
  }

  // Direkt zu S3 hochladen mit Presigned URL
  const uploadToS3 = async (
    file: File, 
    videoId: string,
    folder: S3Folder = 'uploads'
  ): Promise<{ key: string; url: string; fileUrl: string }> => {
    try {
      // 1. Presigned URL von unserer API anfordern
      const presignedResponse = await fetch('/api/get-upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          folder,
        }),
      });

      if (!presignedResponse.ok) {
        const errorData = await presignedResponse.json();
        throw new Error(errorData.message || 'Fehler beim Generieren der Upload-URL');
      }

      const { uploadUrl, fileUrl, key } = await presignedResponse.json();

      // 2. Die Datei direkt zu S3 hochladen
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Fehler beim Hochladen zu S3');
      }

      // 3. Jetzt die Metadaten in unserer Datenbank speichern
      const metaResponse = await fetch('/api/upload-video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId,
          name: file.name,
          size: file.size,
          type: file.type,
          key,
          url: fileUrl,
          tags: []
        }),
      });

      if (!metaResponse.ok) {
        throw new Error('Fehler beim Speichern der Metadaten');
      }

      return { key, url: uploadUrl, fileUrl };
    } catch (error) {
      console.error('S3 Upload Error:', error);
      throw error;
    }
  };

  // Upload progress simulator (der wirkliche S3-Upload hat keinen Fortschrittsindikator)
  const simulateProgress = (videoId: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 95) {
        progress = 96;
        clearInterval(interval);
      }
      setUploadProgress(prev => ({ ...prev, [videoId]: Math.min(Math.floor(progress), 96) }));
    }, 300);

    return () => clearInterval(interval);
  };

  const handleFiles = async (files: FileList) => {
    setError(null)
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Check if file is a video
      if (!file.type.startsWith('video/')) {
        setError('Only video files are allowed.')
        continue
      }
      
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`File ${file.name} is too large. Maximum size is 500MB.`)
        continue
      }
      
      // Create object URL for the file (für lokale Vorschau)
      const url = URL.createObjectURL(file)
      
      // Generate a unique ID for the video
      const videoId = crypto.randomUUID()
      
      // Add to uploaded videos with temporary blob URL
      const newVideo: UploadedVideo = {
        id: videoId,
        name: file.name,
        size: file.size,
        type: file.type,
        url: url,
        tags: []
      }
      
      setUploadedVideos(prev => [...prev, newVideo])
      
      // Set this video as uploading
      setIsUploading(prev => ({ ...prev, [videoId]: true }))
      setUploadProgress(prev => ({ ...prev, [videoId]: 0 }))
      
      // Starte die Fortschrittsanzeigen-Simulation
      const stopSimulation = simulateProgress(videoId);
      
      // Direkt zu S3 hochladen
      try {
        const { key, fileUrl } = await uploadToS3(file, videoId);
        
        // Update the video with the S3 information
        setUploadedVideos(prev => 
          prev.map(video => 
            video.id === videoId
              ? { ...video, filepath: fileUrl, key }
              : video
          )
        );
        
        // Upload erfolgreich abgeschlossen - setze Fortschritt auf 100%
        setUploadProgress(prev => ({ ...prev, [videoId]: 100 }));
      } catch (error) {
        console.error('Error uploading file:', error)
        setError(`Failed to upload ${file.name}. ${error instanceof Error ? error.message : ''}`)
        
        // Entferne das Video aus der Liste bei Fehler
        setUploadedVideos(prev => prev.filter(video => video.id !== videoId));
      } finally {
        // Stop progress simulation
        stopSimulation();
        
        // Mark as no longer uploading
        setIsUploading(prev => ({ ...prev, [videoId]: false }))
      }
    }
  }

  const removeVideo = (id: string) => {
    setUploadedVideos(prev => {
      const updatedVideos = prev.filter(video => video.id !== id)
      
      // If no videos left, remove from localStorage
      if (updatedVideos.length === 0) {
        localStorage.removeItem('uploadedVideos')
      }
      
      return updatedVideos
    })
    
    if (selectedVideoId === id) {
      setSelectedVideoId(null)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
    else return (bytes / 1073741824).toFixed(1) + ' GB'
  }

  // Add tag to a video
  const addTag = (videoId: string) => {
    if (!currentTag.trim()) return;
    
    setUploadedVideos(prev => 
      prev.map(video => {
        if (video.id === videoId) {
          const updatedTags = [...video.tags, currentTag.trim()];
          
          // Wenn das Video bereits auf S3 ist, aktualisiere die Tags auch in der Datenbank
          if (video.key) {
            fetch('/api/update-video-tags', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                videoId,
                tags: updatedTags
              }),
            }).catch(err => console.error('Error updating tags:', err));
          }
          
          return { ...video, tags: updatedTags };
        }
        return video;
      })
    );
    
    setCurrentTag('');
  };

  // Remove tag from a video
  const removeTag = (videoId: string, tagIndex: number) => {
    setUploadedVideos(prev => 
      prev.map(video => {
        if (video.id === videoId) {
          const updatedTags = [...video.tags];
          updatedTags.splice(tagIndex, 1);
          
          // Wenn das Video bereits auf S3 ist, aktualisiere die Tags auch in der Datenbank
          if (video.key) {
            fetch('/api/update-video-tags', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                videoId,
                tags: updatedTags
              }),
            }).catch(err => console.error('Error updating tags:', err));
          }
          
          return { ...video, tags: updatedTags };
        }
        return video;
      })
    );
  };

  return (
    <main className="container py-12 md:py-20">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
          Upload Your Videos
        </h1>
        <p className="mt-4 text-lg text-white/60">
          Upload video clips to use in your ad. You can add tags to organize them.
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
            onChange={handleChange}
            className="hidden"
          />
          <p className="mt-4 text-sm text-white/40">
            Maximum file size: 500MB
          </p>
          <p className="text-sm text-white/40">
            Supported formats: MP4, MOV, AVI
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Uploaded videos section */}
        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Uploaded Videos{uploadedVideos.length > 0 && ` (${uploadedVideos.length})`}</h2>
          
          {uploadedVideos.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              <FilmIcon className="h-12 w-12 mx-auto mb-2" />
              <p>No videos have been uploaded yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploadedVideos.map(video => (
                <div key={video.id} className="card bg-base-200 shadow-xl overflow-hidden">
                  <div className="relative">
                    <video 
                      src={video.url} 
                      className="w-full h-48 object-cover"
                    />
                    <span className="absolute bottom-2 right-2 bg-black/70 text-xs text-white px-2 py-1 rounded">
                      {formatFileSize(video.size)}
                    </span>
                  </div>
                  
                  <div className="card-body p-4">
                    <div className="flex justify-between items-start">
                      <h3 className="card-title text-sm truncate mr-2">{video.name}</h3>
                      <button 
                        onClick={() => removeVideo(video.id)}
                        className="btn btn-sm btn-circle btn-ghost"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                    
                    {/* Upload Progress */}
                    {isUploading[video.id] && (
                      <div className="mt-2">
                        <div className="flex justify-between text-xs mb-1">
                          <span>Uploading...</span>
                          <span>{uploadProgress[video.id] || 0}%</span>
                        </div>
                        <div className="w-full bg-gray-700 rounded-full h-2">
                          <div 
                            className="bg-primary h-2 rounded-full" 
                            style={{ width: `${uploadProgress[video.id] || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                    
                    {/* S3 Status */}
                    {video.filepath && !isUploading[video.id] && (
                      <div className="mt-2 flex items-center text-xs text-green-400">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Uploaded to S3
                      </div>
                    )}
                    
                    {/* Tags Section */}
                    <div className="mt-3">
                      <div className="flex items-center">
                        <TagIcon className="h-4 w-4 mr-1 text-gray-400" />
                        <span className="text-xs text-gray-400">Tags:</span>
                      </div>
                      
                      <div className="flex flex-wrap gap-1 mt-1">
                        {video.tags.map((tag, index) => (
                          <div key={index} className="badge badge-sm badge-secondary flex items-center gap-1">
                            <span>{tag}</span>
                            <button onClick={() => removeTag(video.id, index)} className="h-3 w-3 flex items-center justify-center">
                              <XMarkIcon className="h-2 w-2" />
                            </button>
                          </div>
                        ))}
                        
                        {video.tags.length === 0 && (
                          <span className="text-xs text-gray-500">No tags yet</span>
                        )}
                      </div>
                      
                      {/* Add Tag Input */}
                      {selectedVideoId === video.id && (
                        <div className="mt-2 flex items-center gap-1">
                          <input
                            type="text"
                            value={currentTag}
                            onChange={(e) => setCurrentTag(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && addTag(video.id)}
                            placeholder="Add tag..."
                            className="input input-xs input-bordered flex-1"
                          />
                          <button
                            onClick={() => addTag(video.id)}
                            className="btn btn-xs btn-primary"
                            disabled={!currentTag.trim()}
                          >
                            Add
                          </button>
                        </div>
                      )}
                      
                      {selectedVideoId !== video.id && (
                        <button
                          onClick={() => setSelectedVideoId(video.id)}
                          className="btn btn-xs btn-ghost mt-1"
                        >
                          + Add Tag
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Guidelines */}
        <div className="mt-12 p-6 rounded-lg border border-white/10 bg-white/5">
          <h2 className="text-xl font-semibold mb-4">Tips for Better Results</h2>
          <ul className="space-y-2 text-white/70">
            <li className="flex items-start">
              <CheckCircleIcon className="h-5 w-5 mr-2 text-primary-light flex-shrink-0 mt-0.5" />
              <span>Upload high-quality video clips that match your voiceover content</span>
            </li>
            <li className="flex items-start">
              <CheckCircleIcon className="h-5 w-5 mr-2 text-primary-light flex-shrink-0 mt-0.5" />
              <span>Add descriptive tags to help organize your videos</span>
            </li>
            <li className="flex items-start">
              <CheckCircleIcon className="h-5 w-5 mr-2 text-primary-light flex-shrink-0 mt-0.5" />
              <span>Include a variety of shots and angles for more dynamic ads</span>
            </li>
            <li className="flex items-start">
              <CheckCircleIcon className="h-5 w-5 mr-2 text-primary-light flex-shrink-0 mt-0.5" />
              <span>Shorter clips (5-15 seconds) work best for most ad formats</span>
            </li>
          </ul>
        </div>

        {/* Navigation Buttons */}
        <div className="mt-12 flex justify-between">
          <Link
            href="/voiceover"
            className="inline-flex items-center px-4 py-2 text-white/70 hover:text-white"
          >
            ← Back to Voiceover
          </Link>
          
          {uploadedVideos.length > 0 && (
            <Link
              href="/editor"
              className="inline-flex items-center px-6 py-3 text-white bg-gradient-to-r from-primary to-primary-light rounded-lg hover:opacity-90 transition-opacity"
            >
              Continue to Editor
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Link>
          )}
        </div>
      </div>
    </main>
  )
} 