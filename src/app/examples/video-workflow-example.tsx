'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { 
  ArrowPathIcon, 
  CheckCircleIcon, 
  ExclamationTriangleIcon,
  VideoCameraIcon,
  SpeakerWaveIcon,
  CloudArrowUpIcon
} from '@heroicons/react/24/outline'

type Video = {
  id: string;
  name: string;
  url: string;
}

type VideoSegment = {
  videoId: string;
  startTime: number;
  duration: number;
  position: number;
}

type WorkflowOptions = {
  resolution?: string;
  aspectRatio?: string;
  addSubtitles?: boolean;
  addWatermark?: boolean;
  watermarkText?: string;
  outputFormat?: string;
}

type Project = {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  outputUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export default function VideoWorkflowExample() {
  const { data: session } = useSession()
  const [videos, setVideos] = useState<Video[]>([])
  const [selectedVideos, setSelectedVideos] = useState<{id: string, segments: VideoSegment[]}[]>([])
  const [voiceoverScript, setVoiceoverScript] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [options, setOptions] = useState<WorkflowOptions>({
    resolution: '1080p',
    aspectRatio: '16:9',
    addSubtitles: true,
    addWatermark: false,
    watermarkText: '',
    outputFormat: 'mp4'
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [statusPollingInterval, setStatusPollingInterval] = useState<NodeJS.Timeout | null>(null)

  // Lade die verfügbaren Videos beim Laden der Komponente
  useEffect(() => {
    if (session) {
      fetchVideos()
    }
  }, [session])

  // Stoppe das Polling, wenn die Komponente unmontiert wird
  useEffect(() => {
    return () => {
      if (statusPollingInterval) {
        clearInterval(statusPollingInterval)
      }
    }
  }, [statusPollingInterval])

  // Lade die Videos des Benutzers
  const fetchVideos = async () => {
    try {
      const response = await fetch('/api/user/videos')
      if (!response.ok) throw new Error('Fehler beim Laden der Videos')
      
      const data = await response.json()
      setVideos(data.videos || [])
    } catch (err) {
      console.error('Fehler beim Laden der Videos:', err)
      setError('Videos konnten nicht geladen werden')
    }
  }

  // Füge ein Video zur Auswahl hinzu
  const addVideoToSelection = (videoId: string) => {
    if (selectedVideos.some(v => v.id === videoId)) return

    setSelectedVideos([
      ...selectedVideos,
      {
        id: videoId,
        segments: [
          {
            videoId,
            startTime: 0,
            duration: 10, // Standardmäßig 10 Sekunden
            position: selectedVideos.length
          }
        ]
      }
    ])
  }

  // Entferne ein Video aus der Auswahl
  const removeVideoFromSelection = (videoId: string) => {
    setSelectedVideos(selectedVideos.filter(v => v.id !== videoId))
  }

  // Aktualisiere ein Segment
  const updateSegment = (videoId: string, segmentIndex: number, updates: Partial<VideoSegment>) => {
    setSelectedVideos(selectedVideos.map(video => {
      if (video.id !== videoId) return video
      
      const newSegments = [...video.segments]
      newSegments[segmentIndex] = { ...newSegments[segmentIndex], ...updates }
      
      return { ...video, segments: newSegments }
    }))
  }

  // Starte den Workflow
  const startWorkflow = async () => {
    if (!title || selectedVideos.length === 0) {
      setError('Bitte fülle alle Pflichtfelder aus')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch('/api/video-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title,
          description,
          voiceoverScript: voiceoverScript || undefined,
          videos: selectedVideos,
          options
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Fehler beim Starten des Workflows')
      }

      // Starte das Polling für Statusupdates
      startStatusPolling(data.projectId)
      
      // Setze das aktuelle Projekt
      setCurrentProject({
        id: data.projectId,
        title,
        status: 'processing',
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })

      // Setze das Formular zurück
      resetForm()
    } catch (err) {
      console.error('Fehler beim Starten des Workflows:', err)
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Starte das Polling für Statusupdates
  const startStatusPolling = (projectId: string) => {
    // Beende vorherige Polling-Intervalle
    if (statusPollingInterval) {
      clearInterval(statusPollingInterval)
    }

    // Starte ein neues Polling
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/video-workflow?projectId=${projectId}`)
        if (!response.ok) {
          throw new Error('Fehler beim Abrufen des Projektstatus')
        }

        const data = await response.json()
        setCurrentProject(data.project)

        // Beende das Polling, wenn der Job abgeschlossen oder fehlgeschlagen ist
        if (data.project.status === 'completed' || data.project.status === 'failed') {
          clearInterval(interval)
          setStatusPollingInterval(null)
          
          // Lade alle Projekte neu
          fetchProjects()
        }
      } catch (err) {
        console.error('Fehler beim Abrufen des Projektstatus:', err)
      }
    }, 5000) // Alle 5 Sekunden

    setStatusPollingInterval(interval)
  }

  // Lade alle Projekte
  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/video-workflow')
      if (!response.ok) throw new Error('Fehler beim Laden der Projekte')
      
      const data = await response.json()
      setProjects(data.projects || [])
    } catch (err) {
      console.error('Fehler beim Laden der Projekte:', err)
    }
  }

  // Formular zurücksetzen
  const resetForm = () => {
    setTitle('')
    setDescription('')
    setVoiceoverScript('')
    setSelectedVideos([])
    setOptions({
      resolution: '1080p',
      aspectRatio: '16:9',
      addSubtitles: true,
      addWatermark: false,
      watermarkText: '',
      outputFormat: 'mp4'
    })
  }

  if (!session) {
    return (
      <div className="p-6 text-center">
        <p>Bitte melde dich an, um diese Funktion zu nutzen.</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Video-Workflow Beispiel</h1>
      
      {/* Formular zum Erstellen eines neuen Workflows */}
      <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
        <h2 className="text-2xl font-semibold mb-4">Neues Werbevideo erstellen</h2>
        
        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-md p-3 mb-4 text-red-200 flex items-start">
            <ExclamationTriangleIcon className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Titel <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3"
                placeholder="Mein Werbevideo"
                required
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Beschreibung</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3"
                rows={3}
                placeholder="Beschreibe dein Werbevideo..."
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Voiceover-Skript</label>
              <textarea
                value={voiceoverScript}
                onChange={(e) => setVoiceoverScript(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3"
                rows={5}
                placeholder="Text für das Voiceover..."
              />
            </div>
          </div>
          
          <div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Videos <span className="text-red-500">*</span></label>
              <div className="bg-gray-900 border border-gray-700 rounded-md p-3 h-[200px] overflow-y-auto mb-2">
                {videos.length === 0 ? (
                  <p className="text-gray-400 text-center">Keine Videos verfügbar</p>
                ) : (
                  <ul className="space-y-2">
                    {videos.map(video => (
                      <li key={video.id} className="flex items-center justify-between">
                        <span className="truncate">{video.name}</span>
                        <button
                          onClick={() => addVideoToSelection(video.id)}
                          disabled={selectedVideos.some(v => v.id === video.id)}
                          className={`text-xs px-2 py-1 rounded ${
                            selectedVideos.some(v => v.id === video.id)
                              ? 'bg-green-900/30 text-green-400'
                              : 'bg-blue-900/30 text-blue-400 hover:bg-blue-800/30'
                          }`}
                        >
                          {selectedVideos.some(v => v.id === video.id) ? 'Ausgewählt' : 'Hinzufügen'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              
              {selectedVideos.length > 0 && (
                <div className="bg-gray-900 border border-gray-700 rounded-md p-3">
                  <h3 className="text-sm font-medium mb-2">Ausgewählte Videos:</h3>
                  <ul className="space-y-3">
                    {selectedVideos.map((selectedVideo, i) => {
                      const video = videos.find(v => v.id === selectedVideo.id);
                      return (
                        <li key={selectedVideo.id} className="border-b border-gray-700 pb-2 last:border-0 last:pb-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{video?.name || 'Unbekanntes Video'}</span>
                            <button
                              onClick={() => removeVideoFromSelection(selectedVideo.id)}
                              className="text-xs px-2 py-1 rounded bg-red-900/30 text-red-400 hover:bg-red-800/30"
                            >
                              Entfernen
                            </button>
                          </div>
                          
                          {selectedVideo.segments.map((segment, j) => (
                            <div key={j} className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2 text-sm">
                              <div>
                                <label className="block text-xs text-gray-400">Startzeit (s)</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={segment.startTime}
                                  onChange={(e) => updateSegment(
                                    selectedVideo.id,
                                    j,
                                    { startTime: parseFloat(e.target.value) || 0 }
                                  )}
                                  className="w-20 bg-gray-800 border border-gray-700 rounded py-1 px-2"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-xs text-gray-400">Dauer (s)</label>
                                <input
                                  type="number"
                                  min="0.1"
                                  value={segment.duration}
                                  onChange={(e) => updateSegment(
                                    selectedVideo.id,
                                    j,
                                    { duration: parseFloat(e.target.value) || 0 }
                                  )}
                                  className="w-20 bg-gray-800 border border-gray-700 rounded py-1 px-2"
                                />
                              </div>
                              
                              <div>
                                <label className="block text-xs text-gray-400">Position</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={segment.position}
                                  onChange={(e) => updateSegment(
                                    selectedVideo.id,
                                    j,
                                    { position: parseInt(e.target.value) || 0 }
                                  )}
                                  className="w-20 bg-gray-800 border border-gray-700 rounded py-1 px-2"
                                />
                              </div>
                            </div>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Auflösung</label>
                <select
                  value={options.resolution}
                  onChange={(e) => setOptions({ ...options, resolution: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3"
                >
                  <option value="1080p">1080p</option>
                  <option value="720p">720p</option>
                  <option value="480p">480p</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Seitenverhältnis</label>
                <select
                  value={options.aspectRatio}
                  onChange={(e) => setOptions({ ...options, aspectRatio: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3"
                >
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="1:1">1:1 (Square)</option>
                  <option value="9:16">9:16 (Portrait)</option>
                </select>
              </div>
            </div>
            
            <div className="mt-4 flex items-center gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={options.addSubtitles}
                  onChange={(e) => setOptions({ ...options, addSubtitles: e.target.checked })}
                  className="rounded"
                />
                <span className="ml-2">Untertitel hinzufügen</span>
              </label>
              
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={options.addWatermark}
                  onChange={(e) => setOptions({ ...options, addWatermark: e.target.checked })}
                  className="rounded"
                />
                <span className="ml-2">Wasserzeichen</span>
              </label>
            </div>
            
            {options.addWatermark && (
              <div className="mt-2">
                <input
                  type="text"
                  value={options.watermarkText}
                  onChange={(e) => setOptions({ ...options, watermarkText: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 px-3"
                  placeholder="Wasserzeichen-Text"
                />
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-6">
          <button
            onClick={startWorkflow}
            disabled={isSubmitting || selectedVideos.length === 0 || !title}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {isSubmitting ? (
              <>
                <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                Wird gestartet...
              </>
            ) : (
              <>
                <CloudArrowUpIcon className="h-5 w-5 mr-2" />
                Workflow starten
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Aktueller Workflow-Status */}
      {currentProject && (
        <div className="bg-gray-800 rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-2xl font-semibold mb-4">Aktueller Workflow</h2>
          
          <div className="bg-gray-900 border border-gray-700 rounded-md p-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xl font-medium">{currentProject.title}</h3>
                <p className="text-gray-400 text-sm">ID: {currentProject.id}</p>
              </div>
              
              <div className="flex items-center">
                {currentProject.status === 'pending' && (
                  <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 rounded text-xs">Warten</span>
                )}
                {currentProject.status === 'processing' && (
                  <span className="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs flex items-center">
                    <ArrowPathIcon className="h-3 w-3 mr-1 animate-spin" />
                    Verarbeitung
                  </span>
                )}
                {currentProject.status === 'completed' && (
                  <span className="px-2 py-1 bg-green-900/30 text-green-400 rounded text-xs flex items-center">
                    <CheckCircleIcon className="h-3 w-3 mr-1" />
                    Abgeschlossen
                  </span>
                )}
                {currentProject.status === 'failed' && (
                  <span className="px-2 py-1 bg-red-900/30 text-red-400 rounded text-xs flex items-center">
                    <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
                    Fehlgeschlagen
                  </span>
                )}
              </div>
            </div>
            
            {['pending', 'processing'].includes(currentProject.status) && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Fortschritt</span>
                  <span>{currentProject.progress}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full" 
                    style={{ width: `${currentProject.progress}%` }}
                  ></div>
                </div>
              </div>
            )}
            
            {currentProject.error && (
              <div className="bg-red-900/30 border border-red-500 rounded-md p-3 mb-4 text-red-200">
                <p className="font-medium">Fehler:</p>
                <p>{currentProject.error}</p>
              </div>
            )}
            
            {currentProject.outputUrl && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Fertiges Video:</h4>
                <div className="bg-gray-800 border border-gray-700 rounded-md p-3 flex items-center justify-between">
                  <a 
                    href={currentProject.outputUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline"
                  >
                    {currentProject.outputUrl.split('/').pop()}
                  </a>
                  <a 
                    href={currentProject.outputUrl} 
                    download
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                  >
                    Herunterladen
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Liste der Projekte */}
      <div className="bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">Meine Projekte</h2>
          <button
            onClick={fetchProjects}
            className="text-sm px-3 py-1 bg-gray-700 rounded hover:bg-gray-600 flex items-center"
          >
            <ArrowPathIcon className="h-4 w-4 mr-1" />
            Aktualisieren
          </button>
        </div>
        
        {projects.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Keine Projekte gefunden.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => (
              <div key={project.id} className="bg-gray-900 border border-gray-700 rounded-md p-4">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-medium">{project.title}</h3>
                  {project.status === 'pending' && (
                    <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 rounded text-xs">Warten</span>
                  )}
                  {project.status === 'processing' && (
                    <span className="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs">Verarbeitung</span>
                  )}
                  {project.status === 'completed' && (
                    <span className="px-2 py-1 bg-green-900/30 text-green-400 rounded text-xs">Abgeschlossen</span>
                  )}
                  {project.status === 'failed' && (
                    <span className="px-2 py-1 bg-red-900/30 text-red-400 rounded text-xs">Fehlgeschlagen</span>
                  )}
                </div>
                
                <p className="text-gray-400 text-xs mb-3">
                  Erstellt: {new Date(project.createdAt).toLocaleString()}
                </p>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => startStatusPolling(project.id)}
                    className="text-xs px-2 py-1 bg-blue-900/30 text-blue-400 rounded hover:bg-blue-800/30 flex items-center"
                  >
                    <ArrowPathIcon className="h-3 w-3 mr-1" />
                    Status
                  </button>
                  
                  {project.outputUrl && (
                    <a
                      href={project.outputUrl}
                      download
                      className="text-xs px-2 py-1 bg-green-900/30 text-green-400 rounded hover:bg-green-800/30 flex items-center"
                    >
                      <CloudArrowUpIcon className="h-3 w-3 mr-1" />
                      Download
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
} 