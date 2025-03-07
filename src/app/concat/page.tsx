'use client'

import React, { useState, useRef } from 'react'
import { ArrowUpTrayIcon, XMarkIcon, ArrowRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

type UploadedVideo = {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

export default function ConcatPage() {
  // State management
  const [dragActive, setDragActive] = useState(false)
  const [uploadedVideos, setUploadedVideos] = useState<UploadedVideo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [outputVideo, setOutputVideo] = useState<string | null>(null)
  
  // Reference to file input
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Maximum allowed file size (500MB)
  const MAX_FILE_SIZE = 500 * 1024 * 1024
  
  // Handle drag events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }
  
  // Handle drop event
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }
  
  // Handle file input change
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
  }
  
  // Process uploaded files
  const handleFiles = (files: FileList) => {
    // Reset error message
    setError(null)
    setSuccess(null)
    
    const newVideos: UploadedVideo[] = []
    
    Array.from(files).forEach(file => {
      // Validate file type
      if (!file.type.startsWith('video/')) {
        setError(`${file.name} ist kein Video.`)
        return
      }
      
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} ist zu groß (max. 500MB).`)
        return
      }
      
      // Create URL for preview
      const url = URL.createObjectURL(file)
      
      // Add video to array
      newVideos.push({
        id: `video-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name: file.name,
        size: file.size,
        type: file.type,
        url
      })
    })
    
    if (newVideos.length > 0) {
      setUploadedVideos(prev => [...prev, ...newVideos])
    }
  }
  
  // Remove a video
  const removeVideo = (id: string) => {
    setUploadedVideos(prev => {
      const filtered = prev.filter(video => video.id !== id)
      // If we're removing all videos, also clear output
      if (filtered.length === 0) {
        setOutputVideo(null)
      }
      return filtered
    })
  }
  
  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' bytes';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB';
    else return (bytes / 1048576).toFixed(2) + ' MB';
  }
  
  // Handle video concatenation
  const handleConcatenateVideos = async () => {
    if (uploadedVideos.length === 0) {
      setError('Bitte laden Sie mindestens ein Video hoch.');
      return;
    }
    
    setError(null);
    setSuccess(null);
    setLoading(true);
    
    try {
      // Upload videos to server if they are local blobs
      const uploadPromises = uploadedVideos.map(async (video) => {
        if (video.url.startsWith('blob:')) {
          // Create FormData
          const formData = new FormData();
          const response = await fetch(video.url);
          const blob = await response.blob();
          formData.append('file', blob, video.name);
          
          // Upload to server
          const uploadResponse = await fetch('/api/upload-video', {
            method: 'POST',
            body: formData,
          });
          
          if (!uploadResponse.ok) {
            throw new Error(`Upload failed for ${video.name}`);
          }
          
          const data = await uploadResponse.json();
          return {
            id: video.id,
            url: data.url,
          };
        }
        
        return {
          id: video.id,
          url: video.url,
        };
      });
      
      const uploadedUrls = await Promise.all(uploadPromises);
      
      // Call concat API
      const concatResponse = await fetch('/api/concat-videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videos: uploadedUrls,
        }),
      });
      
      if (!concatResponse.ok) {
        const errorData = await concatResponse.json();
        throw new Error(errorData.error || 'Unknown error occurred');
      }
      
      const result = await concatResponse.json();
      setOutputVideo(result.videoUrl);
      setSuccess('Videos wurden erfolgreich zusammengefügt!');
    } catch (err) {
      console.error('Error during video concatenation:', err);
      setError(err instanceof Error ? err.message : 'Ein unbekannter Fehler ist aufgetreten.');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <main className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Videos zusammenfügen</h1>
        <p className="text-gray-600 dark:text-gray-300 mb-2">
          Laden Sie Videos hoch, die zusammengefügt werden sollen.
        </p>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Unterstützte Formate: MP4, MOV, AVI, etc. - Max. 500MB pro Datei
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          {/* Upload Area */}
          <div 
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-gray-300 dark:border-gray-700'
            }`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
          >
            <ArrowUpTrayIcon className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
            <p className="mb-2 font-medium">Videos hier ablegen oder</p>
            <button 
              onClick={() => inputRef.current?.click()}
              className="btn btn-primary"
            >
              Videos auswählen
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="video/*"
              onChange={handleChange}
              className="hidden"
            />
          </div>
          
          {/* Error Message */}
          {error && (
            <div className="mt-4 p-4 bg-error/10 border border-error rounded-lg text-error">
              <p>{error}</p>
            </div>
          )}
          
          {/* Success Message */}
          {success && (
            <div className="mt-4 p-4 bg-success/10 border border-success rounded-lg text-success flex items-center gap-2">
              <CheckCircleIcon className="w-5 h-5" />
              <p>{success}</p>
            </div>
          )}
          
          {/* Output Video */}
          {outputVideo && (
            <div className="mt-6">
              <h3 className="text-xl font-semibold mb-3">Zusammengefügtes Video:</h3>
              <div className="rounded-lg overflow-hidden shadow-lg border dark:border-gray-700">
                <video 
                  src={outputVideo} 
                  controls 
                  className="w-full h-auto"
                />
                <div className="p-4 bg-gray-50 dark:bg-gray-800">
                  <div className="flex justify-between">
                    <span className="font-medium">Ausgabe-Video</span>
                    <a 
                      href={outputVideo} 
                      download 
                      className="text-primary hover:underline"
                    >
                      Herunterladen
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div>
          {/* Video List & Actions */}
          <div className="border rounded-xl dark:border-gray-700 overflow-hidden">
            <div className="p-4 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold">Videos ({uploadedVideos.length})</h3>
            </div>
            
            {uploadedVideos.length > 0 ? (
              <>
                <div className="max-h-96 overflow-y-auto">
                  {uploadedVideos.map((video, index) => (
                    <div 
                      key={video.id}
                      className="p-3 flex items-center gap-3 border-b last:border-0 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div 
                        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-primary/10 text-primary font-medium"
                      >
                        {index + 1}
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="font-medium truncate">{video.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatFileSize(video.size)}
                        </p>
                      </div>
                      <button 
                        onClick={() => removeVideo(video.id)}
                        className="text-gray-500 hover:text-error transition-colors"
                      >
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700">
                  <button 
                    onClick={handleConcatenateVideos}
                    disabled={loading || uploadedVideos.length === 0}
                    className="btn btn-primary w-full flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <span className="loading loading-spinner loading-sm"></span>
                        Verarbeite...
                      </>
                    ) : (
                      <>
                        <ArrowRightIcon className="w-5 h-5" />
                        Videos zusammenfügen
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                <p>Noch keine Videos ausgewählt</p>
              </div>
            )}
          </div>
          
          <div className="mt-4 flex justify-between">
            <Link href="/" className="text-primary hover:underline flex items-center gap-1">
              <ArrowRightIcon className="w-4 h-4 rotate-180" />
              Zurück zur Startseite
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
} 