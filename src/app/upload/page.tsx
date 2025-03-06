'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ArrowUpTrayIcon, XMarkIcon, TagIcon, ArrowRightIcon, CheckCircleIcon, FilmIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

// Define the structure for uploaded video objects
type UploadedVideo = {
  id: string;      // Unique identifier for the video
  name: string;    // Original filename
  size: number;    // File size in bytes
  type: string;    // MIME type of the video
  url: string;     // Local object URL for preview
  tags: string[];  // Array of user-defined tags
  filepath?: string; // Server path for the uploaded video
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
  const [isUploading, setIsUploading] = useState<{[key: string]: boolean}>({})
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({})

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
      
      // Create object URL for the file
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
      
      // Upload to server
      try {
        // Create form data
        const formData = new FormData()
        formData.append('file', file)
        formData.append('tags', JSON.stringify([]))
        formData.append('videoId', videoId)  // Add video ID to form data
        
        // Upload file
        const response = await fetch('/api/upload-video', {
          method: 'POST',
          body: formData
        })
        
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.statusText}`)
        }
        
        const data = await response.json()
        
        // Update the video with the server filepath
        setUploadedVideos(prev => 
          prev.map(video => 
            video.id === videoId
              ? { ...video, filepath: data.fileUrl }
              : video
          )
        )
      } catch (error) {
        console.error('Error uploading file:', error)
        setError(`Failed to upload ${file.name}. ${error instanceof Error ? error.message : ''}`)
      } finally {
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
                    <h3 className="card-title text-base">{video.name}</h3>
                    
                    {/* Video ID for reference */}
                    <div className="text-xs text-gray-500 mt-1">
                      ID: <span className="font-mono">{video.id}</span>
                    </div>
                    
                    {/* Server filepath if available */}
                    {video.filepath && (
                      <div className="text-xs text-green-600 mt-1 overflow-hidden text-ellipsis">
                        ✓ Uploaded to: <span className="font-mono">{video.filepath}</span>
                      </div>
                    )}
                    
                    {/* Tags section */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {video.tags.map(tag => (
                        <div key={`${video.id}-${tag}`} className="badge badge-primary badge-sm gap-1">
                          {tag}
                          <button onClick={() => handleTagRemove(video.id, tag)}>
                            <XMarkIcon className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    
                    {/* Add tag input (only show for selected video) */}
                    {selectedVideoId === video.id && (
                      <div className="mt-2 flex">
                        <div className="input-group">
                          <input
                            type="text"
                            placeholder="Add tag"
                            className="input input-sm input-bordered flex-grow"
                            value={currentTag}
                            onChange={e => setCurrentTag(e.target.value)}
                            onKeyPress={e => handleTagKeyPress(e, video.id)}
                          />
                          <button 
                            className="btn btn-sm btn-square"
                            onClick={() => handleTagAdd(video.id)}
                          >
                            <TagIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {/* Upload status */}
                    {isUploading[video.id] && (
                      <div className="mt-2">
                        <progress className="progress progress-primary w-full" value={uploadProgress[video.id] || 0} max="100"></progress>
                        <p className="text-xs text-center mt-1">Uploading... {Math.round(uploadProgress[video.id] || 0)}%</p>
                      </div>
                    )}
                    
                    <div className="card-actions justify-between mt-3">
                      <button
                        className="btn btn-sm btn-ghost gap-1"
                        onClick={() => setSelectedVideoId(selectedVideoId === video.id ? null : video.id)}
                      >
                        <TagIcon className="h-4 w-4" />
                        {selectedVideoId === video.id ? 'Done' : 'Tags'}
                      </button>
                      
                      <button
                        className="btn btn-sm btn-error gap-1"
                        onClick={() => removeVideo(video.id)}
                      >
                        <XMarkIcon className="h-4 w-4" />
                        Remove
                      </button>
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