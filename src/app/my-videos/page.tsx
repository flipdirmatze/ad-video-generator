'use client'

import React, { useEffect, useState } from 'react'
import { 
  ArrowDownTrayIcon, 
  PlayIcon, 
  PencilIcon, 
  TrashIcon, 
  ClockIcon,
  FilmIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { formatDistanceToNow } from 'date-fns'
import { de } from 'date-fns/locale'
import { useRouter } from 'next/navigation'

// Typ für generierte Videos (basierend auf dem Project-Modell)
type GeneratedVideo = {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  signedUrl?: string;
  createdAt: string;
  updatedAt: string;
  thumbnailUrl?: string;
}

export default function MyVideosPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [videos, setVideos] = useState<GeneratedVideo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState<{[key: string]: boolean}>({})

  // Authentifizierungs-Prüfung
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }

    if (status === 'authenticated') {
      fetchProjects()
    }
  }, [status, router])

  // Videos aus der Datenbank laden
  const fetchProjects = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/projects')
      
      if (response.ok) {
        const data = await response.json()
        setVideos(data.projects || [])
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Fehler beim Laden der Videos')
      }
    } catch (err) {
      setError('Fehler beim Laden der Videos. Bitte versuche es später erneut.')
      console.error('Error fetching projects:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Video löschen
  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm('Möchtest du dieses Video wirklich löschen?')) {
      return
    }

    setIsDeleting(prev => ({ ...prev, [videoId]: true }))
    
    try {
      const response = await fetch(`/api/projects/${videoId}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        // Video aus der Liste entfernen
        setVideos(videos.filter(video => video.id !== videoId))
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Fehler beim Löschen des Videos')
      }
    } catch (err) {
      setError('Fehler beim Löschen des Videos. Bitte versuche es später erneut.')
      console.error('Error deleting video:', err)
    } finally {
      setIsDeleting(prev => ({ ...prev, [videoId]: false }))
    }
  }

  // Formatiere das Datum
  function formatDate(dateString: string) {
    try {
      return formatDistanceToNow(new Date(dateString), { 
        addSuffix: true,
        locale: de
      })
    } catch (e) {
      return 'Unbekanntes Datum'
    }
  }

  // Rendere den Status-Badge
  function renderStatusBadge(status: string) {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            Fertig
          </span>
        )
      case 'processing':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            In Bearbeitung
          </span>
        )
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            Ausstehend
          </span>
        )
      case 'failed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            Fehlgeschlagen
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status}
          </span>
        )
    }
  }

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-8">Meine Videos</h1>
          <div className="flex justify-center items-center h-64">
            <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">Meine Videos</h1>
          <button 
            onClick={() => router.push('/editor')}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
          >
            Neues Video erstellen
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {videos.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <h2 className="text-xl text-gray-300 mb-4">Du hast noch keine Videos erstellt</h2>
            <p className="text-gray-400 mb-6">Erstelle dein erstes Video im Video Editor</p>
            <button 
              onClick={() => router.push('/editor')}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors"
            >
              Zum Video Editor
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((video) => (
              <div key={video.id} className="bg-gray-800 rounded-lg overflow-hidden shadow-lg">
                {video.status === 'completed' && video.signedUrl ? (
                  <div className="relative aspect-video bg-gray-900">
                    <video 
                      src={video.signedUrl} 
                      className="w-full h-full object-contain" 
                      controls
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-gray-900 flex items-center justify-center">
                    {video.status === 'processing' ? (
                      <div className="text-center">
                        <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                        <p className="text-gray-400">Video wird verarbeitet...</p>
                      </div>
                    ) : (
                      <p className="text-gray-500">Kein Video verfügbar</p>
                    )}
                  </div>
                )}
                
                <div className="p-4">
                  <h3 className="text-lg font-medium text-white mb-2 truncate">{video.title}</h3>
                  <div className="flex justify-between items-center text-sm text-gray-400 mb-4">
                    <span>Erstellt: {formatDate(video.createdAt)}</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      video.status === 'completed' 
                        ? 'bg-green-900/30 text-green-400' 
                        : video.status === 'processing' 
                          ? 'bg-yellow-900/30 text-yellow-400'
                          : 'bg-red-900/30 text-red-400'
                    }`}>
                      {video.status === 'completed' 
                        ? 'Fertig' 
                        : video.status === 'processing' 
                          ? 'In Bearbeitung'
                          : 'Fehler'}
                    </span>
                  </div>
                  
                  <div className="flex space-x-2">
                    {video.status === 'completed' && video.signedUrl && (
                      <a 
                        href={video.signedUrl} 
                        download={`${video.title}.mp4`}
                        className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-center rounded-md transition-colors"
                      >
                        Herunterladen
                      </a>
                    )}
                    <button 
                      onClick={() => handleDeleteVideo(video.id)}
                      disabled={isDeleting[video.id]}
                      className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDeleting[video.id] ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Löschen...
                        </span>
                      ) : 'Löschen'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 