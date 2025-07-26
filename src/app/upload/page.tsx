'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowUpTrayIcon, ArrowRightIcon, CheckCircleIcon, FilmIcon, TagIcon, XMarkIcon, DocumentMagnifyingGlassIcon, ExclamationTriangleIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useDropzone, DropEvent, FileRejection } from 'react-dropzone'
import VideoTrimmerModal from '@/components/VideoTrimmerModal'; // Importieren
// REMOVED: import { startVideoTrimJob } from '@/lib/aws-lambda'; // Lambda Service importieren

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
  const [isUploading, setIsUploading] = useState<boolean>(false)
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
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
  const [tags, setTags] = useState<Record<string, string[]>>({})

  // State für das Trimmer Modal
  const [isTrimmerOpen, setIsTrimmerOpen] = useState(false);
  const [currentVideoFile, setCurrentVideoFile] = useState<File | null>(null);
  const [trimTimes, setTrimTimes] = useState<{ startTime: number, endTime: number } | null>(null);
  const [pendingFilesQueue, setPendingFilesQueue] = useState<File[]>([]);


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

  useEffect(() => {
    // Wenn das Modal geschlossen wird und eine Datei in der Warteschlange ist, öffne das Modal für die nächste Datei
    if (!isTrimmerOpen && pendingFilesQueue.length > 0) {
      const nextFile = pendingFilesQueue[0];
      setPendingFilesQueue(prev => prev.slice(1));
      setCurrentVideoFile(nextFile);
      setIsTrimmerOpen(true);
    }
  }, [isTrimmerOpen, pendingFilesQueue]);

  // Funktion zum Holen der signierten URL (Definition hier sicherstellen)
  const getSignedUrlForKey = useCallback(async (key: string, videoId: string) => {
    if (!key || key === 'pending') return;
    try {
      const response = await fetch(`/api/get-signed-url?key=${encodeURIComponent(key)}`);
      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          setSignedUrls(prev => ({ ...prev, [videoId]: data.url }));
        }
      } else {
         console.warn(`Failed to get signed URL for key ${key}: ${response.status}`);
      }
    } catch (err) {
      console.error(`Error fetching signed URL for ${key}:`, err);
    }
  }, [/* Keine Abhängigkeiten hier, da setSignedUrls stabil ist */]);

  // Korrigierte onDrop/handleFiles Funktion
  const handleFiles = useCallback(async (acceptedFiles: File[], fileRejections: FileRejection[], event: DropEvent | null) => {
    setError(null)
    
    const videoFiles = acceptedFiles.filter(file => file.type.startsWith('video/'));
    if (videoFiles.length !== acceptedFiles.length) {
      setError('Einige Dateien waren keine Videos und wurden ignoriert.');
    }

    if (videoFiles.length === 0) {
      return;
    }
    
    // Füge die hochgeladenen Dateien zur Warteschlange hinzu
    setPendingFilesQueue(prev => [...prev, ...videoFiles]);

  }, []); 

  // Diese Funktion wird aufgerufen, wenn der Trimmer bestätigt wird
  const handleTrimAndUpload = async (startTime: number, endTime: number) => {
    if (!currentVideoFile) return;

    const file = currentVideoFile;
    setIsUploading(true);
    
    const videoId = crypto.randomUUID(); 
    const tempUrl = URL.createObjectURL(file); 
      
    // Limit auf 150MB für Video-Uploads
    const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150MB
    if (file.size > MAX_FILE_SIZE) {
      setError(`Datei ${file.name} ist zu groß. Maximale Größe ist 150MB.`)
      URL.revokeObjectURL(tempUrl);
      setIsUploading(false);
      return
    }
    
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
          folder: 'uploads' // Videos werden immer noch in 'uploads' gespeichert
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
      
      // 3. Send video metadata to backend API (WITHOUT trim times)
      const metadataResponse = await fetch('/api/upload-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          videoId, 
          name: file.name, 
          size: file.size, 
          type: file.type, 
          key, 
          url: fileUrl, 
          tags: []
          // REMOVED: trim times - Lambda handles this now
        }),
      });
      
      if (!metadataResponse.ok) {
          const errorData = await metadataResponse.json();
          throw new Error(errorData.error || 'Failed to save video metadata');
      }
      
      const metadataData = await metadataResponse.json();
      console.log('Upload completed - Raw API Response Data:', metadataData);

      if (!metadataData || !metadataData.videoId) { 
          console.error('Error: videoId is missing in the API response.', metadataData);
          setError(`Failed to process metadata for ${file.name}. API response invalid.`);
          setUploadProgress(prev => { const { [videoId]: _, ...rest } = prev; return rest; });
          return; 
      }

      // Upload erfolgreich markieren (Progress entfernen)
      setUploadProgress(prev => { 
          const { [videoId]: _, ...rest } = prev; 
          return rest; 
      }); 
      
      // Zeige temporär einen "Wird geschnitten..." Status
      const newVideo: UploadedVideo = {
        id: metadataData.videoId,
        name: file.name,
        size: file.size,
        type: 'processing', // Spezieller Typ für den Trimm-Status
        url: '',
        tags: [],
        key: metadataData.key
      };
      
      // Video zur Liste hinzufügen
      setUploadedVideos(prev => [newVideo, ...prev]);
      
      // 4. JETZT NEU: Starte Lambda-Funktion für Video-Trimming über API-Route
      console.log('Starting Lambda video trimming via API...');
      try {
        const response = await fetch('/api/trim-video', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoId: metadataData.videoId,
            inputPath: key, // S3 key des hochgeladenen Videos
            startTime,
            endTime
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `API request failed with status: ${response.status}`);
        }

        const lambdaResult = await response.json();

        if (lambdaResult.success) {
          console.log('Lambda trimming completed successfully:', lambdaResult);
          
          // Video-Status auf 'complete' setzen und URL aktualisieren
          setUploadedVideos(prev => prev.map(video => {
            if (video.id === metadataData.videoId) {
              return {
                ...video,
                type: file.type, // Zurück zum ursprünglichen Typ
                url: lambdaResult.outputKey ? `/api/video-stream/${video.id}` : video.url
              };
            }
            return video;
          }));
          
          setSuccess(`Video ${file.name} wurde erfolgreich geschnitten und gespeichert!`);
        } else {
          console.error('Lambda trimming failed:', lambdaResult.error);
          
          // Video-Status auf 'failed' setzen
          setUploadedVideos(prev => prev.map(video => {
            if (video.id === metadataData.videoId) {
              return { ...video, type: 'failed' };
            }
            return video;
          }));
          
          setError(`Video-Bearbeitung fehlgeschlagen: ${lambdaResult.error}`);
        }
      } catch (lambdaError) {
        console.error('Lambda invocation error:', lambdaError);
        
        // Video-Status auf 'failed' setzen
        setUploadedVideos(prev => prev.map(video => {
          if (video.id === metadataData.videoId) {
            return { ...video, type: 'failed' };
          }
          return video;
        }));
        
        setError(`Video-Bearbeitung fehlgeschlagen: ${lambdaError instanceof Error ? lambdaError.message : 'Unbekannter Fehler'}`);
      }
      
    } catch (error) {
      console.error('Upload error:', error)
      setError(`Failed to upload ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setUploadProgress(prev => { const { [videoId]: _, ...rest } = prev; return rest; });
    } finally {
      setIsUploading(false);
      URL.revokeObjectURL(tempUrl);
    }
  };

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
      {/* Trimmer Modal */}
      {currentVideoFile && (
        <VideoTrimmerModal
          isOpen={isTrimmerOpen}
          onClose={() => {
            setIsTrimmerOpen(false);
            setCurrentVideoFile(null);
          }}
          videoFile={currentVideoFile}
          onTrim={(startTime, endTime) => {
            handleTrimAndUpload(startTime, endTime);
            setIsTrimmerOpen(false); // Schließe das Modal nach Bestätigung
          }}
        />
      )}

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
          } transition-colors cursor-pointer`}
        >
          <input {...getInputProps()} />
          <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-white/40" />
          <p className="mt-4 text-lg font-medium">
            Drag and drop your video files here
          </p>
          <p className="mt-2 text-white/60">
            or click to select files
          </p>
          <p className="mt-4 text-sm text-white/40">
            Maximum file size: 150MB
          </p>
          <p className="mt-1 text-sm text-white/40">
            Allowed formats: MP4, WebM, MOV, AVI, WMV, MKV
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Anzeige für laufende Uploads */}
        {Object.keys(uploadProgress).length > 0 && (
          <div className="mt-8 mb-4 p-4 bg-gray-800/50 rounded-lg border border-gray-700/50">
            <h3 className="text-lg font-semibold mb-3">Laufende Uploads...</h3>
            <div className="space-y-2">
              {Object.entries(uploadProgress).map(([id, progress]) => (
                <div key={id} className="text-sm">
                  {/* Optional: Name der Datei anzeigen, wenn wir ihn speichern */}
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 transition-all duration-150"
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                  <div className="text-right text-xs text-gray-400 mt-1">{progress}%</div>
                </div>
              ))}
            </div>
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
                <div key={video.id} className="relative flex flex-col rounded-lg overflow-hidden bg-gray-800 border border-gray-700/50">
                  {/* NEUE LOGIK für den Verarbeitungsstatus */}
                  {video.type === 'processing' ? (
                    <div className="flex flex-col items-center justify-center h-full p-4" style={{ minHeight: '280px' }}>
                      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                      <p className="text-sm font-semibold text-white/90">Video wird geschnitten...</p>
                      <p className="text-xs text-white/60 mt-1 text-center">Dieser Vorgang dauert nur einen Moment.</p>
                      
                      {/* Optional: Upload-Fortschritt für die Originaldatei, falls verfügbar */}
                      {uploadProgress[video.id] !== undefined && (
                         <div className="w-full mt-4">
                            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-purple-600 transition-all duration-150"
                                style={{ width: `${uploadProgress[video.id]}%` }}
                              ></div>
                            </div>
                            <div className="text-right text-xs text-gray-400 mt-1">{uploadProgress[video.id]}% hochgeladen</div>
                         </div>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Bestehende Logik für Tags und Video-Player */}
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

                      <div className="relative">
                        {/* Delete Button moved here */}
                        <button
                          onClick={() => handleDeleteVideo(video.id, video.name)}
                          disabled={isDeleting[video.id]}
                          className={`absolute top-2 right-2 z-20 p-1.5 rounded-full transition-colors 
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
                      </div>
                    </>
                  )}
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