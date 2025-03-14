'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
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
  // State für temporäre Videos, die noch hochgeladen werden (optimistisches UI)
  const [pendingUploads, setPendingUploads] = useState<UploadedVideo[]>([])
  const [videoAspectRatios, setVideoAspectRatios] = useState<{[key: string]: string}>({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null)
  // State für signierte URLs für Videowiedergabe
  const [videoPlaybackUrls, setVideoPlaybackUrls] = useState<{[key: string]: string}>({})
  const [videoToDelete, setVideoToDelete] = useState<UploadedVideo | null>(null)

  // Kombiniere permanente und temporäre Videos für die Anzeige
  const allVideos = [...uploadedVideos, ...pendingUploads];
  
  // Entfernen des gesamten loadVideoMetadata useCallback und useEffect-Hooks
  // Füge einen Callback für das Laden von Video-Metadaten hinzu - außerhalb von useEffect
  // const loadVideoMetadata = useCallback((video: UploadedVideo) => {
  // ...
  // }, [videoAspectRatios]);
  
  // Funktion zum Abrufen einer signierten URL für die Videowiedergabe
  const getVideoPlaybackUrl = useCallback(async (video: UploadedVideo): Promise<string> => {
    // Wenn es bereits eine Playback-URL gibt, diese verwenden
    if (videoPlaybackUrls[video.id]) {
      return videoPlaybackUrls[video.id];
    }
    
    // Für lokale Video-URLs (blob:) einfach die Original-URL verwenden
    if (video.url.startsWith('blob:')) {
      return video.url;
    }
    
    // Versuchen, die URL direkt zu verwenden
    try {
      // URL im Cache speichern
      setVideoPlaybackUrls(prev => ({
        ...prev,
        [video.id]: video.url
      }));
      return video.url;
    } catch (e) {
      console.warn(`Failed to access video URL directly: ${video.url}`);
      return video.url; // Fallback zur originalen URL
    }
  }, [videoPlaybackUrls]);
  
  // Vorbereiten der Videowiedergabe beim Laden der Seite
  useEffect(() => {
    const prepareVideoPlayback = async () => {
      const newUrls: {[key: string]: string} = {};
      for (const video of allVideos) {
        if (!videoPlaybackUrls[video.id]) {
          try {
            const url = await getVideoPlaybackUrl(video);
            newUrls[video.id] = url;
          } catch (e) {
            console.error(`Error preparing video playback for ${video.name}:`, e);
          }
        }
      }
      
      if (Object.keys(newUrls).length > 0) {
        setVideoPlaybackUrls(prev => ({
          ...prev,
          ...newUrls
        }));
      }
    };
    
    if (allVideos.length > 0) {
      prepareVideoPlayback();
    }
  }, [allVideos, videoPlaybackUrls, getVideoPlaybackUrl]);
  
  // HOOK 3: Aspektverhältnisse verwalten
  // useEffect(() => {
  // ...
  // }, [allVideos, videoAspectRatios, loadVideoMetadata]);
  
  // Stattdessen: Einfacher Ansatz für Video-Vorschau mit festem Format
  const getVideoFormat = (video: UploadedVideo) => {
    // Wenn wir bereits ein Aspektverhältnis für dieses Video haben, verwenden wir es
    if (videoAspectRatios[video.id]) {
      return videoAspectRatios[video.id];
    }
    
    // Ansonsten: Standard-Format (horizontal/landscape) zurückgeben
    // und asynchron das Format bestimmen (außerhalb des Rendering-Zyklus)
    setTimeout(() => {
      // Nur ausführen, wenn das Video noch nicht verarbeitet wurde
      if (!videoAspectRatios[video.id]) {
        const videoEl = document.createElement('video');
        videoEl.onloadedmetadata = () => {
          const aspectRatio = videoEl.videoWidth / videoEl.videoHeight;
          const format = aspectRatio < 0.8 ? 'vertical' : aspectRatio > 1.3 ? 'horizontal' : 'square';
          
          // Werte nur aktualisieren, wenn sie sich ändern würden
          setVideoAspectRatios(prev => {
            if (prev[video.id] === format) return prev;
            return { ...prev, [video.id]: format };
          });
        };
        
        videoEl.onerror = () => {
          // Bei Fehler: Standard-Format verwenden
          setVideoAspectRatios(prev => {
            if (prev[video.id]) return prev;
            return { ...prev, [video.id]: 'horizontal' };
          });
        };
        
        videoEl.src = video.url;
      }
    }, 0);
    
    return 'horizontal'; // Standard-Format als Fallback
  };

  // HOOK 1: Authentifizierungs-Check und Redirect
  useEffect(() => {
    if (!isLoading && status !== 'loading') {
      if (status !== 'authenticated') {
        router.push('/auth/signin?callbackUrl=/upload')
      }
    }
    setIsLoading(false)
  }, [status, isLoading, router])

  // HOOK 2: Videos aus der Datenbank laden
  useEffect(() => {
    const fetchVideosFromDatabase = async () => {
      try {
        const response = await fetch('/api/media')
        if (response.ok) {
          const data = await response.json()
          
          if (data.files && data.files.length > 0) {
            console.log('Loaded videos from database:', data.files.length)
            
            // Videodaten aus der Datenbank in unser Format umwandeln
            const dbVideos = data.files.map((video: any) => ({
              id: video.id,
              name: video.name,
              size: video.size,
              type: video.type,
              url: video.url,
              tags: video.tags || [],
              filepath: video.path,
              key: video.key
            }))
            
            setUploadedVideos(dbVideos)
          } else {
            // Wenn keine Videos vorhanden sind, leeres Array setzen
            setUploadedVideos([])
          }
        } else {
          console.error('Failed to fetch videos from database')
        }
      } catch (error) {
        console.error('Error fetching videos:', error)
      }
    }
    
    // Nur Videos laden, wenn der Nutzer angemeldet ist
    if (session?.user?.id) {
      fetchVideosFromDatabase()
    }
  }, [session])

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

  // Aktualisiere die Videos-Liste nach erfolgreichem Upload
  const refreshVideos = async () => {
    try {
      const response = await fetch('/api/media')
      if (response.ok) {
        const data = await response.json()
        
        if (data.files && data.files.length > 0) {
          const dbVideos = data.files.map((video: any) => ({
            id: video.id,
            name: video.name,
            size: video.size,
            type: video.type,
            url: video.url,
            tags: video.tags || [],
            filepath: video.path,
            key: video.key
          }))
          
          setUploadedVideos(dbVideos)
          setPendingUploads([]) // Leere die pendingUploads-Liste nach erfolgreichem Refresh
        }
      }
    } catch (error) {
      console.error('Error refreshing videos:', error)
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
      
      // Erstelle ein temporäres Video-Objekt für optimistisches UI
      const newVideo: UploadedVideo = {
        id: videoId,
        name: file.name,
        size: file.size,
        type: file.type,
        url: url,
        tags: []
      }
      
      // Füge das Video zu pendingUploads hinzu (optimistisches UI)
      setPendingUploads(prev => [...prev, newVideo])
      
      // Set this video as uploading
      setIsUploading(prev => ({ ...prev, [videoId]: true }))
      setUploadProgress(prev => ({ ...prev, [videoId]: 0 }))
      
      // Starte die Fortschrittsanzeigen-Simulation
      const stopSimulation = simulateProgress(videoId);
      
      // Direkt zu S3 hochladen
      try {
        const { key, fileUrl } = await uploadToS3(file, videoId);
        
        // Aktualisiere die Fortschrittsanzeige auf 100%
        setUploadProgress(prev => ({ ...prev, [videoId]: 100 }));
        
        // Aktualisiere die Video-Liste vom Server
        await refreshVideos();
      } catch (error) {
        console.error('Error uploading file:', error)
        setError(`Failed to upload ${file.name}. ${error instanceof Error ? error.message : ''}`)
        
        // Entferne das Video aus pendingUploads bei Fehler
        setPendingUploads(prev => prev.filter(video => video.id !== videoId));
      } finally {
        // Stop progress simulation
        stopSimulation();
        
        // Mark as no longer uploading
        setIsUploading(prev => ({ ...prev, [videoId]: false }))
      }
    }
  }

  const removeVideo = async (id: string) => {
    // Wenn der Löschbestätigungsdialog nicht für dieses Video angezeigt wird,
    // zeige ihn an und führe die Löschung nicht sofort aus
    if (showDeleteConfirm !== id) {
      setShowDeleteConfirm(id)
      return
    }
    
    // Reset delete confirmation state
    setShowDeleteConfirm(null)
    
    try {
      // Prüfe, ob es sich um ein temporäres Video handelt
      const isPending = pendingUploads.some(video => video.id === id);
      
      if (isPending) {
        // Entferne nur aus der lokalen pendingUploads-Liste
        setPendingUploads(prev => prev.filter(video => video.id !== id));
      } else {
        // Lösche Video über API auf dem Server
        const response = await fetch(`/api/media/${id}`, {
          method: 'DELETE',
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Fehler beim Löschen des Videos');
        }
        
        // Aktualisiere die Videoliste
        setUploadedVideos(prev => prev.filter(video => video.id !== id));
      }
      
      if (selectedVideoId === id) {
        setSelectedVideoId(null);
      }
    } catch (error) {
      console.error('Error removing video:', error);
      setError(`Failed to remove video. ${error instanceof Error ? error.message : ''}`);
    }
  }

  // Funktion zum Abbrechen der Löschbestätigung
  const cancelDelete = () => {
    setShowDeleteConfirm(null)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
    else return (bytes / 1073741824).toFixed(1) + ' GB'
  }

  // Add tag to a video
  const addTag = async (videoId: string) => {
    if (!currentTag || currentTag.trim() === '') return
    
    // Prüfe, ob es sich um ein temporäres Video handelt
    const isPending = pendingUploads.some(video => video.id === videoId);
    
    if (isPending) {
      // Für temporäre Videos, speichere Tags nur lokal
      setPendingUploads(prev => {
        return prev.map(video => {
          if (video.id === videoId && !video.tags.includes(currentTag)) {
            return { ...video, tags: [...video.tags, currentTag] };
          }
          return video;
        });
      });
    } else {
      // Für Datenbank-Videos, speichere Tags auf dem Server
      try {
        const videoToUpdate = uploadedVideos.find(v => v.id === videoId);
        
        if (!videoToUpdate) return;
        
        // Prüfen, ob das Tag bereits existiert
        if (videoToUpdate.tags.includes(currentTag)) return;
        
        const newTags = [...videoToUpdate.tags, currentTag];
        
        // Tags in der Datenbank aktualisieren
        const response = await fetch('/api/update-video-tags', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoId,
            tags: newTags,
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update tags in database');
        }
        
        // Lokale Video-Liste aktualisieren
        setUploadedVideos(prev => {
          return prev.map(video => {
            if (video.id === videoId) {
              return { ...video, tags: newTags };
            }
            return video;
          });
        });
      } catch (error) {
        console.error('Error updating tags:', error);
        setError(`Failed to update tags. ${error instanceof Error ? error.message : ''}`);
      }
    }
    
    setCurrentTag('');
    setSelectedVideoId(null);
  }

  // Remove tag from a video
  const removeTag = async (videoId: string, tagIndex: number) => {
    // Prüfe, ob es sich um ein temporäres Video handelt
    const isPending = pendingUploads.some(video => video.id === videoId);
    
    if (isPending) {
      // Für temporäre Videos, entferne Tags nur lokal
      setPendingUploads(prev => {
        return prev.map(video => {
          if (video.id === videoId) {
            const newTags = [...video.tags];
            newTags.splice(tagIndex, 1);
            return { ...video, tags: newTags };
          }
          return video;
        });
      });
    } else {
      // Für Datenbank-Videos, aktualisiere Tags auf dem Server
      try {
        const videoToUpdate = uploadedVideos.find(v => v.id === videoId);
        
        if (!videoToUpdate) return;
        
        const newTags = [...videoToUpdate.tags];
        newTags.splice(tagIndex, 1);
        
        // Tags in der Datenbank aktualisieren
        const response = await fetch('/api/update-video-tags', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            videoId,
            tags: newTags,
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update tags in database');
        }
        
        // Lokale Video-Liste aktualisieren
        setUploadedVideos(prev => {
          return prev.map(video => {
            if (video.id === videoId) {
              return { ...video, tags: newTags };
            }
            return video;
          });
        });
      } catch (error) {
        console.error('Error removing tag:', error);
        setError(`Failed to remove tag. ${error instanceof Error ? error.message : ''}`);
      }
    }
  }

  return (
    <main className="container py-12 md:py-20">
      <div className="max-w-6xl mx-auto">
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
          <h2 className="text-xl font-semibold mb-4">Uploaded Videos{allVideos.length > 0 && ` (${allVideos.length})`}</h2>
          
          {allVideos.length === 0 ? (
            <div className="text-gray-400 text-center py-8">
              <FilmIcon className="h-12 w-12 mx-auto mb-2" />
              <p>No videos have been uploaded yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {allVideos.map((video) => (
                <div 
                  key={video.id} 
                  className={`relative group rounded-lg overflow-hidden ${getVideoFormat(video) || ''}`}
                >
                  <video 
                    className="w-full h-full object-cover rounded-lg" 
                    src={videoPlaybackUrls[video.id] || video.url}
                    autoPlay={false}
                    controls
                    muted
                    loop
                    poster="/images/video-placeholder.svg"
                    preload="metadata"
                    onError={(e) => {
                      console.error(`Error loading video ${video.name}:`, e);
                      // Optional: Bei Wiedergabefehlern einen Fallback anzeigen
                      const target = e.target as HTMLVideoElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        const fallback = document.createElement('div');
                        fallback.className = 'w-full h-full flex items-center justify-center bg-gray-900 text-white';
                        fallback.innerHTML = `
                          <div class="text-center p-4">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 mx-auto text-red-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                        `;
                        parent.appendChild(fallback);
                      }
                    }}
                  />
                  
                  {/* Upload progress indicator */}
                  {uploadProgress[video.id] !== undefined && uploadProgress[video.id] < 100 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
                      <div className="w-2/3 h-2 bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${uploadProgress[video.id]}%` }}
                        />
                      </div>
                      <p className="mt-2 text-white text-sm">
                        Uploading... {uploadProgress[video.id]}%
                      </p>
                    </div>
                  )}
                  
                  {/* Upload complete indicator */}
                  {uploadProgress[video.id] === 100 && (
                    <div className="absolute top-2 right-2 bg-green-500/20 text-green-400 py-1 px-2 rounded-md flex items-center text-xs">
                      <CheckCircleIcon className="h-4 w-4 mr-1" />
                      Upload complete
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {/* Continue to Editor Button */}
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