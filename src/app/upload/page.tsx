'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowUpTrayIcon, ArrowRightIcon, CheckCircleIcon, FilmIcon, TagIcon, XMarkIcon, DocumentMagnifyingGlassIcon, ExclamationTriangleIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useDropzone, DropEvent, FileRejection } from 'react-dropzone'

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

// Debounce Funktion (falls noch nicht vorhanden)
const debounce = (fn: (...args: any[]) => any, ms = 300) => {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function(this: any, ...args: any[]) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  };
};

export default function UploadPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
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
  const [projectId, setProjectId] = useState<string | null>(null)
  const [workflowStep, setWorkflowStep] = useState<string | null>(null)
  const [success, setSuccess] = useState('')
  const [untaggedVideos, setUntaggedVideos] = useState(0)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({})
  const tagInputRef = useRef<HTMLInputElement | null>(null)

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
            
            // Speichere die signierten URLs in einem separaten State für Zugriffssteuerung
            const urlMap = videos.reduce((acc: Record<string, string>, video: UploadedVideo) => {
              acc[video.id] = video.url;
              return acc;
            }, {} as Record<string, string>);
            setSignedUrls(urlMap);
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
    
    // Check for existing project
    const savedProjectId = localStorage.getItem('currentProjectId');
    if (savedProjectId) {
      fetch(`/api/workflow-state?projectId=${savedProjectId}`)
        .then(response => {
          if (response.ok) {
            return response.json();
          }
          throw new Error('Project not found');
        })
        .then(data => {
          if (data.success && data.project) {
            setProjectId(data.project.id);
            setWorkflowStep(data.project.workflowStep);
          }
        })
        .catch(error => {
          console.error('Error loading project:', error);
          // Clear invalid project ID
          localStorage.removeItem('currentProjectId');
        });
    }
  }, [session]);

  useEffect(() => {
    // Prüfe auf Videos ohne Tags
    const checkUntaggedVideos = async () => {
      try {
        const response = await fetch('/api/videos?untagged=true')
        const data = await response.json()
        
        if (response.ok && data.videos) {
          setUntaggedVideos(data.videos.length)
        }
      } catch (err) {
        console.error('Fehler beim Prüfen der Videos ohne Tags:', err)
      }
    }
    
    checkUntaggedVideos()
  }, [])

  // Vereinfachter File-Upload
  const handleFiles = useCallback(async (acceptedFiles: File[], fileRejections: FileRejection[], event: DropEvent | null) => {
    setError(null)
    setSuccess('') // Reset success message
    
    const videoFiles = acceptedFiles.filter(file => file.type.startsWith('video/'));
    if (videoFiles.length !== acceptedFiles.length) {
      setError('Einige Dateien waren keine Videos und wurden ignoriert.');
    }

    if (videoFiles.length === 0) {
      setIsUploading(prev => ({ ...prev, ...Object.fromEntries(videoFiles.map(file => ([crypto.randomUUID(), false])) as [string, boolean][] as Record<string, boolean>) }));
      return;
    }

    const uploadPromises = videoFiles.map(async (file) => {
      const videoId = crypto.randomUUID()
      
      // Wir erhöhen das Limit auf 2GB für direkte S3-Uploads
      const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
      if (file.size > MAX_FILE_SIZE) {
        setError(`File ${file.name} is too large. Maximum size is 2GB.`)
        return
      }
      
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
      
      try {
        // 1. Hole einen presigned URL von der API
        console.log(`Getting presigned URL for file: ${file.name} (${file.size} bytes)`)
        const uploadUrlResponse = await fetch('/api/get-upload-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            folder: 'uploads'
          })
        })
        
        if (!uploadUrlResponse.ok) {
          throw new Error('Failed to get upload URL')
        }
        
        const { uploadUrl, fileUrl, key } = await uploadUrlResponse.json()
        
        // 2. Lade die Datei direkt zu S3 hoch mit Progress-Tracking
        console.log(`Uploading file directly to S3: ${uploadUrl}`)
        
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        xhr.setRequestHeader('Content-Type', file.type)
        
        // Progress-Tracking
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100)
            setUploadProgress(prev => ({ ...prev, [videoId]: percentComplete }))
          }
        }
        
        // Promise für den Upload
        const uploadPromise = new Promise<void>((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status === 200) {
              resolve()
            } else {
              reject(new Error(`Upload failed with status: ${xhr.status}`))
            }
          }
          xhr.onerror = () => reject(new Error('Upload failed'))
          xhr.onabort = () => reject(new Error('Upload aborted'))
        })
        
        // Datei senden
        xhr.send(file)
        await uploadPromise
        
        // 3. Speichere die Metadaten in der Datenbank
        console.log(`File uploaded successfully, saving metadata to database`)
        const metadataResponse = await fetch('/api/upload-video', {
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
          })
        })
        
        if (!metadataResponse.ok) {
          throw new Error('Failed to save video metadata')
        }
        
        // Extrahiere die Response-Daten
        const metadataData = await metadataResponse.json();
        console.log('Upload completed successfully:', metadataData);
        
        // Upload erfolgreich markieren
        setUploadProgress(prev => ({ ...prev, [videoId]: 100 }));
        setIsUploading(prev => ({ ...prev, [videoId]: false }));
        
        // Pending Upload entfernen
        setPendingUploads(prev => prev.filter(v => v.id !== videoId));
        
        // Verwende die signierte URL aus der Antwort, falls vorhanden
        const videoUrl = metadataData.url || fileUrl;
        
        // Neues Video-Objekt erstellen
        const newVideo: UploadedVideo = {
          id: videoId,
          name: file.name,
          size: file.size,
          type: file.type,
          url: videoUrl,
          tags: [],
          key: key
        };
        
        // Video-Liste aktualisieren - an den Anfang setzen
        setUploadedVideos(prev => [newVideo, ...prev]);
        
        // Speichere die URL auch in den signierten URLs
        setSignedUrls(prev => ({
          ...prev,
          [videoId]: videoUrl
        }));
        
        // Erfolgsmeldung anzeigen
        setSuccess(`Video "${file.name}" erfolgreich hochgeladen`);
        
        // Zum Zurücksetzen des Videos nach 2-3 Sekunden für korrektes Laden
        setTimeout(() => {
          const videoElement = document.querySelector(`video[data-id="${videoId}"]`) as HTMLVideoElement;
          if (videoElement) {
            videoElement.src = videoUrl;
            videoElement.load();
          }
        }, 500);
        
      } catch (error) {
        console.error('Upload error:', error)
        setError(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
        setIsUploading(prev => ({ ...prev, [videoId]: false }))
        setPendingUploads(prev => prev.filter(v => v.id !== videoId))
      }
      
      URL.revokeObjectURL(url)
    });

    await Promise.all(uploadPromises);
  }, []);

  // Tag management functions
  const handleTagChange = (videoId: string, value: string) => {
    setCurrentTag(value);
  };

  const addTag = async (videoId: string) => {
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

  const removeTag = async (videoId: string, tagToRemove: string) => {
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

  // NEUE FUNKTION: Video löschen
  const handleDeleteVideo = async (videoId: string, videoName: string) => {
    if (isDeleting[videoId]) return; // Verhindere Doppelklicks

    if (window.confirm(`Möchtest du das Video "${videoName}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
      console.log(`Attempting to delete video: ${videoId}`);
      setIsDeleting(prev => ({ ...prev, [videoId]: true }));
      setError(null);

      try {
        const response = await fetch(`/api/media/${videoId}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Failed to delete video (status: ${response.status})`);
        }

        // Erfolgreich gelöscht
        console.log(`Successfully deleted video: ${videoId}`);
        // Entferne Video aus dem State
        setUploadedVideos(prev => prev.filter(video => video.id !== videoId));
        // Entferne zugehörige Tags und Input-Status
        setSignedUrls(prev => {
          const { [videoId]: _, ...rest } = prev;
          return rest;
        });

      } catch (err) {
        console.error(`Error deleting video ${videoId}:`, err);
        setError(`Fehler beim Löschen von ${videoName}: ${err instanceof Error ? err.message : 'Unbekannter Fehler'}`);
      } finally {
        setIsDeleting(prev => ({ ...prev, [videoId]: false }));
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop: handleFiles, 
    accept: { 'video/*': [] } 
  });

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
          Upload Video Clips
        </h1>
        <p className="mt-4 text-lg text-white/60">
          Upload video clips to use in your ad.
        </p>

        <div className="container mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto space-y-8">
            <div>
              <div className="p-4 rounded-lg bg-blue-900/20 border border-blue-700/20 text-blue-400">
                <h3 className="font-medium">Workflow-Tipp</h3>
                <p className="mt-1">
                  Nachdem du Videos hochgeladen und getaggt hast, nutze das <strong>Script Matching</strong>, um passende Videos für dein Voiceover zu finden.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Upload Area */}
        <div 
          {...getRootProps()}
          className={`mt-8 border-2 border-dashed rounded-lg p-8 text-center ${
            isDragActive ? 'border-blue-500 bg-blue-900/20' : 'border-gray-600 hover:border-gray-500 bg-gray-800/30'
          } transition-colors`}
        >
          <input {...getInputProps()} />
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
            onChange={(e) => {
              if (e.target.files) {
                // Konvertiere FileList zu File[]
                const filesArray = Array.from(e.target.files);
                // Rufe handleFiles mit konvertiertem Array und leeren/null Argumenten für Rejections/Event auf
                handleFiles(filesArray, [], null as unknown as DropEvent); 
              }
            }}
            className="hidden"
            style={{ display: 'none' }}
          />
          <p className="mt-4 text-sm text-white/40">
            Maximum file size: 2GB
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
                <div key={video.id} className="flex flex-col rounded-lg overflow-hidden bg-gray-800">
                  {/* Delete Button Top Right */}
                  <button
                    onClick={() => handleDeleteVideo(video.id, video.name)}
                    disabled={isDeleting[video.id]}
                    className={`absolute top-2 right-2 z-10 p-1.5 rounded-full transition-colors 
                                ${isDeleting[video.id]
                                  ? 'bg-gray-600 cursor-not-allowed' 
                                  : 'bg-red-800/70 hover:bg-red-700 text-white'}`}
                    aria-label="Video löschen"
                  >
                    {isDeleting[video.id] ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <TrashIcon className="h-4 w-4" />
                    )}
                  </button>

                  {/* Tags Section - Above video */}
                  <div className="p-2 bg-gray-800 border-b border-gray-700">
                    <div className="flex flex-wrap gap-1 mb-2">
                      {video.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="bg-purple-500/20 text-purple-300 text-xs px-2 py-1 rounded-full flex items-center"
                        >
                          {tag}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTag(video.id, tag);
                            }}
                            className="ml-1 hover:text-white"
                            aria-label={`Remove tag ${tag}`}
                          >
                            <XMarkIcon className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    
                    {selectedVideoId === video.id ? (
                      <div className="flex gap-2">
                        <input
                          ref={tagInputRef}
                          type="text"
                          value={currentTag}
                          onChange={(e) => handleTagChange(video.id, e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && addTag(video.id)}
                          placeholder="Add tag..."
                          className="flex-1 bg-white/10 text-white text-sm rounded px-2 py-1"
                          aria-label="Enter new tag"
                        />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addTag(video.id);
                          }}
                          className="bg-purple-500 text-white px-2 py-1 rounded text-sm hover:bg-purple-600 transition-colors"
                          aria-label="Add tag"
                        >
                          Add
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVideoId(video.id);
                        }}
                        className="text-white/60 text-sm flex items-center hover:text-white transition-colors"
                        aria-label="Show tag input"
                      >
                        <TagIcon className="h-4 w-4 mr-1" />
                        Add Tag
                      </button>
                    )}
                  </div>

                  {/* Video Container */}
                  <div className="relative">
                    {/* Video Element */}
                    <video 
                      className="w-full object-cover"
                      src={signedUrls[video.id] || video.url}
                      data-id={video.id}
                      controls
                      controlsList="nodownload"
                      preload="metadata"
                      playsInline
                      muted
                      crossOrigin="anonymous"
                      onError={async (e) => {
                        const target = e.target as HTMLVideoElement;
                        console.error('Video loading error:', {
                          videoId: video.id,
                          videoName: video.name,
                          errorCode: target.error?.code,
                          errorMessage: target.error?.message,
                          currentSrc: target.currentSrc,
                          passedUrl: signedUrls[video.id] || video.url,
                          videoKey: video.key
                        });

                        // Wenn bereits ein Upload-Fortschritt angezeigt wird und dieser nicht abgeschlossen ist,
                        // dann ist der Fehler wahrscheinlich auf den noch nicht abgeschlossenen Upload zurückzuführen.
                        if (uploadProgress[video.id] !== undefined && uploadProgress[video.id] < 100) {
                          console.log(`[Video Error Handler] Upload for ${video.name} in progress (${uploadProgress[video.id]}%), ignoring playback error for now.`);
                          return;
                        }
                        
                        // Versuche immer, eine neue signierte URL zu erhalten, wenn ein Fehler auftritt
                        // und ein gültiger video.key vorhanden ist.
                        if (target.error && video.key) {
                          console.log(`[Video Error Handler] Attempting to refresh signed URL for ${video.name} (key: ${video.key})`);
                          try {
                            const response = await fetch(`/api/get-signed-url?key=${encodeURIComponent(video.key)}`);
                            if (response.ok) {
                              const data = await response.json();
                              if (data.url) {
                                console.log(`[Video Error Handler] Successfully refreshed signed URL for ${video.name}: ${data.url}`);
                                setSignedUrls(prev => ({
                                  ...prev,
                                  [video.id]: data.url
                                }));
                                // Wichtig: Nachdem die URL im State aktualisiert wurde, muss das Video-Element
                                // dazu gebracht werden, die neue URL zu verwenden. 
                                // Ein direkter .src-Wechsel und .load() ist hier am zuverlässigsten.
                                target.src = data.url;
                                target.load(); 
                                return; // Verhindere, dass der generische setError unten ausgelöst wird
                              }
                            }
                            // Wenn die Antwort nicht ok ist oder keine URL enthält, werfe einen Fehler, um zum Catch-Block zu gelangen
                            const errorText = await response.text();
                            throw new Error(`Failed to get new signed URL: ${response.status} ${errorText}`);
                          } catch (refreshError) {
                            console.error(`[Video Error Handler] Error refreshing signed URL for ${video.name}:`, refreshError);
                            // Hier den setError nicht global setzen, da es sonst alle Videos betrifft.
                            // Der Fehler wird bereits im Log erfasst.
                          }
                        }
                        
                        // Generischer Fehler, wenn kein Key vorhanden ist oder das Neuladen fehlschlägt
                        // Dieser Fehler wird nur angezeigt, wenn das automatische Neuladen fehlschlägt.
                        setError(`Failed to load video: ${video.name}. Please try refreshing the page or re-uploading.`);
                      }}
                      style={{ minHeight: '200px' }}
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

                    {/* Video Name Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-black bg-opacity-50">
                      <div className="flex items-center justify-between">
                        <span className="text-white text-sm truncate">{video.name}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Continue Button */}
        {allVideos.length > 0 && (
          <div className="mt-8 space-y-4">
            <div className="flex justify-end">
              <Link
                href="/script-matcher"
                className="flex items-center bg-blue-600 hover:bg-blue-500 text-white py-2 px-4 rounded-lg"
              >
                Weiter zu Script Matching
                <ArrowRightIcon className="h-5 w-5 ml-2" />
              </Link>
            </div>
          </div>
        )}

        {(success || untaggedVideos > 0) && (
          <div className="mt-8 space-y-6">
            {success && (
              <div className="p-4 bg-green-900/30 border border-green-500/30 text-green-400 rounded-md">
                {success}
              </div>
            )}
            
            {untaggedVideos > 0 && (
              <div className="p-4 bg-yellow-900/30 border border-yellow-500/30 text-yellow-400 rounded-md">
                <h3 className="font-medium">Videos ohne Tags: {untaggedVideos}</h3>
                <p className="mt-2">
                  Um die besten Ergebnisse zu erzielen, solltest du alle Videos mit Tags versehen.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
} 