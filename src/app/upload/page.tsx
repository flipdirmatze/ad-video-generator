'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ArrowUpTrayIcon, XMarkIcon, TagIcon, ArrowRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

// Define the structure for uploaded video objects
type UploadedVideo = {
  id: string;      // Unique identifier for the video
  name: string;    // Original filename
  size: number;    // File size in bytes
  type: string;    // MIME type of the video
  url: string;     // Local object URL for preview
  tags: string[];  // Array of user-defined tags
}

export default function UploadPage() {
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

  // Load videos from localStorage on component mount
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

  // Save videos to localStorage whenever they change
  useEffect(() => {
    if (uploadedVideos.length > 0) {
      localStorage.setItem('uploadedVideos', JSON.stringify(uploadedVideos))
    }
  }, [uploadedVideos])

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

  const handleFiles = (files: FileList) => {
    setError(null)
    
    Array.from(files).forEach(file => {
      // Check if file is a video
      if (!file.type.startsWith('video/')) {
        setError('Only video files are allowed.')
        return
      }
      
      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`File ${file.name} is too large. Maximum size is 500MB.`)
        return
      }
      
      // Create object URL for the file
      const url = URL.createObjectURL(file)
      
      // Add to uploaded videos
      const newVideo: UploadedVideo = {
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        type: file.type,
        url: url,
        tags: []
      }
      
      setUploadedVideos(prev => [...prev, newVideo])
    })
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

  const handleTagAdd = (id: string) => {
    if (!currentTag.trim()) return
    
    setUploadedVideos(prev => 
      prev.map(video => {
        if (video.id === id && !video.tags.includes(currentTag.trim())) {
          return {
            ...video,
            tags: [...video.tags, currentTag.trim()]
          }
        }
        return video
      })
    )
    
    setCurrentTag('')
  }

  const handleTagRemove = (videoId: string, tagToRemove: string) => {
    setUploadedVideos(prev => 
      prev.map(video => {
        if (video.id === videoId) {
          return {
            ...video,
            tags: video.tags.filter(tag => tag !== tagToRemove)
          }
        }
        return video
      })
    )
  }

  const handleTagKeyPress = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleTagAdd(id)
    }
  }

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

        {/* Upload Queue */}
        {uploadedVideos.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Your Videos ({uploadedVideos.length})</h2>
            <div className="space-y-4">
              {uploadedVideos.map(video => (
                <div 
                  key={video.id} 
                  className={`p-4 rounded-lg border ${
                    selectedVideoId === video.id 
                      ? 'border-primary bg-primary/5' 
                      : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center">
                        <h3 className="font-medium truncate">{video.name}</h3>
                        <span className="ml-2 text-sm text-white/40">
                          {formatFileSize(video.size)}
                        </span>
                      </div>
                      
                      {/* Video Tags */}
                      <div className="mt-2 flex flex-wrap gap-2">
                        {video.tags.map(tag => (
                          <div 
                            key={tag} 
                            className="inline-flex items-center px-2 py-1 rounded-full bg-primary/10 text-primary-light text-xs"
                          >
                            <span>{tag}</span>
                            <button 
                              onClick={() => handleTagRemove(video.id, tag)}
                              className="ml-1 text-primary-light/70 hover:text-primary-light"
                            >
                              <XMarkIcon className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        
                        {selectedVideoId === video.id && (
                          <div className="inline-flex items-center">
                            <input
                              type="text"
                              value={currentTag}
                              onChange={(e) => setCurrentTag(e.target.value)}
                              onKeyPress={(e) => handleTagKeyPress(e, video.id)}
                              placeholder="Add tag..."
                              className="px-2 py-1 w-24 text-xs rounded-l-full bg-white/10 border-y border-l border-white/20 focus:outline-none focus:border-primary-light/50"
                            />
                            <button
                              onClick={() => handleTagAdd(video.id)}
                              className="px-2 py-1 text-xs rounded-r-full bg-white/20 border border-white/20 hover:bg-white/30"
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {selectedVideoId !== video.id && (
                        <button
                          onClick={() => setSelectedVideoId(video.id)}
                          className="p-1 text-white/60 hover:text-primary-light"
                          title="Add tags"
                        >
                          <TagIcon className="h-5 w-5" />
                        </button>
                      )}
                      <button
                        onClick={() => removeVideo(video.id)}
                        className="p-1 text-white/60 hover:text-red-400"
                        title="Remove video"
                      >
                        <XMarkIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Video Preview */}
                  <div className="mt-4">
                    <video 
                      src={video.url} 
                      controls 
                      className="w-full h-auto rounded-lg"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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