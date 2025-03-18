'use client'

import { useState, useEffect, useCallback } from 'react'
import { ScriptSegment } from '@/lib/openai'
import { VideoMatch } from '@/utils/tag-matcher'
import { PlayIcon, PauseIcon, ArrowRightIcon, ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type VoiceoverData = {
  dataUrl: string; // Base64-URL für Browser-Vorschau
  url: string; // S3-URL für dauerhafte Speicherung
  voiceoverId: string;
  fileName: string;
};

export default function ScriptVideoMatcher() {
  const router = useRouter()
  const [script, setScript] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [segments, setSegments] = useState<ScriptSegment[]>([])
  const [matches, setMatches] = useState<VideoMatch[]>([])
  const [error, setError] = useState('')
  const [totalVideos, setTotalVideos] = useState(0)
  const [voiceoverData, setVoiceoverData] = useState<VoiceoverData | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [projectId, setProjectId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [workflowStep, setWorkflowStep] = useState<string | null>(null)
  const [isLoadingProject, setIsLoadingProject] = useState(false)

  // Gespeicherte Projekt- und Voiceover-Daten laden
  useEffect(() => {
    const loadProjectData = async () => {
      setIsLoadingProject(true);
      
      try {
        // Projekt-ID aus localStorage laden
        const savedProjectId = localStorage.getItem('currentProjectId');
        
        if (savedProjectId) {
          // Projekt-Daten vom Server laden
          const response = await fetch(`/api/workflow-state?projectId=${savedProjectId}`);
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.project) {
              setProjectId(data.project.id);
              setWorkflowStep(data.project.workflowStep);
              
              // Wenn das Projekt ein Voiceover-Script hat, lade es
              if (data.project.voiceoverScript) {
                setScript(data.project.voiceoverScript);
              }
              
              // Wenn das Projekt bereits Skript-Segmente hat, lade sie
              if (data.project.scriptSegments && data.project.scriptSegments.length > 0) {
                setSegments(data.project.scriptSegments);
              }
              
              // Wenn das Projekt bereits gematchte Videos hat, lade sie
              if (data.project.matchedVideos && data.project.matchedVideos.length > 0) {
                // Hier müssten wir die matchedVideos in das VideoMatch-Format konvertieren
                // Dies erfordert zusätzliche Daten, die wir später laden müssen
              }
            }
          } else {
            // Wenn das Projekt nicht gefunden wurde, entferne die ID aus dem localStorage
            localStorage.removeItem('currentProjectId');
          }
        }
        
        // Voiceover-Daten aus localStorage laden
        const savedVoiceoverData = localStorage.getItem('voiceoverData');
        if (savedVoiceoverData) {
          try {
            setVoiceoverData(JSON.parse(savedVoiceoverData));
          } catch (e) {
            console.error('Error parsing saved voiceover data:', e);
          }
        } else {
          // Fallback für ältere Version
          const savedVoiceover = localStorage.getItem('voiceoverUrl');
          if (savedVoiceover) {
            setVoiceoverData({
              dataUrl: savedVoiceover,
              url: savedVoiceover, // Legacy: dataUrl und url sind identisch
              voiceoverId: 'legacy',
              fileName: 'voiceover.mp3'
            });
          }
        }

        // Gespeichertes Skript laden, falls noch nicht gesetzt
        if (!script) {
          const savedScript = localStorage.getItem('voiceoverScript');
          if (savedScript) {
            setScript(savedScript);
          }
        }
      } catch (error) {
        console.error('Error loading project data:', error);
        setError('Fehler beim Laden der Projektdaten');
      } finally {
        setIsLoadingProject(false);
        setIsLoading(false);
      }
    };
    
    loadProjectData();
  }, [script]);

  // Audio-Wiedergabe steuern
  const togglePlay = useCallback(() => {
    if (!voiceoverData) return;

    // Die dataUrl für die Browser-Wiedergabe verwenden
    const audioUrl = voiceoverData.dataUrl;

    if (!audioElement) {
      const audio = new Audio(audioUrl)
      audio.addEventListener('ended', () => setIsPlaying(false))
      setAudioElement(audio)
      audio.play()
      setIsPlaying(true)
    } else {
      if (isPlaying) {
        audioElement.pause()
      } else {
        audioElement.play()
      }
      setIsPlaying(!isPlaying)
    }
  }, [voiceoverData, audioElement, isPlaying]);

  async function handleAnalyzeScript() {
    if (!script.trim()) {
      setError('Bitte gib ein Skript ein')
      return
    }

    setIsAnalyzing(true)
    setError('')
    setSegments([])
    setMatches([])

    try {
      const response = await fetch('/api/match-videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ script })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Fehler beim Matching der Videos')
      }

      setSegments(data.segments || [])
      setMatches(data.matches || [])
      setTotalVideos(data.totalVideos || 0)
      
      // Speichere die Segmente im Projekt
      if (data.segments && data.segments.length > 0) {
        await saveScriptSegments(data.segments);
      }
    } catch (err) {
      setError(`Fehler: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleContinueToEditor = async () => {
    if (matches.length > 0) {
      setIsSaving(true);
      
      try {
        // Speichere die Matches im Projekt
        await saveMatchedVideos();
        
        // Navigiere zum Editor
        router.push('/editor');
      } catch (error) {
        setError(`Fehler beim Speichern der Matches: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsSaving(false);
      }
    }
  };
  
  // Speichere die Skript-Segmente im Projekt
  const saveScriptSegments = async (scriptSegments: ScriptSegment[]) => {
    try {
      // Füge IDs zu den Segmenten hinzu, falls sie noch keine haben
      const segmentsWithIds = scriptSegments.map(segment => ({
        ...segment,
        id: segment.id || generateId()
      }));
      
      const response = await fetch('/api/workflow-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: projectId,
          workflowStep: 'matching',
          scriptSegments: segmentsWithIds
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Fehler beim Speichern der Skript-Segmente');
      }
      
      // Aktualisiere die Projekt-ID
      setProjectId(data.projectId);
      localStorage.setItem('currentProjectId', data.projectId);
      
      // Aktualisiere die Segmente mit IDs
      setSegments(segmentsWithIds);
      
      console.log('Script segments saved successfully:', data);
    } catch (error) {
      console.error('Error saving script segments:', error);
      // Kein Fehler anzeigen, da dies ein Hintergrundprozess ist
    }
  };
  
  // Speichere die gematchten Videos im Projekt
  const saveMatchedVideos = async () => {
    try {
      // Konvertiere die Matches in das Format für das Projekt
      const matchedVideos = matches.map((match, index) => ({
        videoId: match.video.id,
        segmentId: match.segment.id || generateId(),
        score: match.score,
        startTime: 0,
        duration: match.segment.duration,
        position: index
      }));
      
      const response = await fetch('/api/workflow-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: projectId,
          workflowStep: 'editing',
          matchedVideos: matchedVideos
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Fehler beim Speichern der gematchten Videos');
      }
      
      // Aktualisiere die Projekt-ID
      setProjectId(data.projectId);
      localStorage.setItem('currentProjectId', data.projectId);
      
      console.log('Matched videos saved successfully:', data);
    } catch (error) {
      console.error('Error saving matched videos:', error);
      throw error;
    }
  };
  
  // Generiere eine eindeutige ID
  const generateId = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  if (isLoading || isLoadingProject) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Wenn kein Voiceover vorhanden ist, zur Voiceover-Seite umleiten
  if (!voiceoverData) {
    return (
      <div className="space-y-6">
        <div className="p-4 bg-yellow-900/30 border border-yellow-500/30 text-yellow-400 rounded-md">
          <h3 className="font-medium">Kein Voiceover gefunden</h3>
          <p className="mt-2">
            Du musst zuerst ein Voiceover erstellen, bevor du Videos matchen kannst.
          </p>
          <Link
            href="/voiceover"
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block"
          >
            Zum Voiceover-Generator
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto mt-10 p-4">
      <h1 className="text-2xl font-bold mb-6">Script-Video Matcher</h1>
      
      {/* Workflow Status */}
      {projectId && (
        <div className="mb-8 bg-base-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Workflow Status</h2>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <div className={`flex-1 rounded-lg p-4 border ${workflowStep === 'voiceover' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
              <div className="flex items-center mb-2">
                <span className={`flex items-center justify-center w-6 h-6 rounded-full mr-2 text-xs ${workflowStep === 'voiceover' ? 'bg-primary text-white' : workflowStep && ['matching', 'editing', 'processing', 'completed'].includes(workflowStep) ? 'bg-green-500 text-white' : 'bg-white/20 text-white/60'}`}>
                  {workflowStep && ['matching', 'editing', 'processing', 'completed'].includes(workflowStep) ? '✓' : '1'}
                </span>
                <span className="font-medium">Voiceover</span>
              </div>
              <p className="text-sm text-white/60 ml-8">
                {script ? 'Voiceover erstellt' : 'Voiceover erstellen'}
              </p>
            </div>
            
            <div className={`flex-1 rounded-lg p-4 border ${workflowStep === 'matching' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
              <div className="flex items-center mb-2">
                <span className={`flex items-center justify-center w-6 h-6 rounded-full mr-2 text-xs ${workflowStep === 'matching' ? 'bg-primary text-white' : workflowStep && ['editing', 'processing', 'completed'].includes(workflowStep) ? 'bg-green-500 text-white' : 'bg-white/20 text-white/60'}`}>
                  {workflowStep && ['editing', 'processing', 'completed'].includes(workflowStep) ? '✓' : '2'}
                </span>
                <span className="font-medium">Video Matching</span>
              </div>
              <p className="text-sm text-white/60 ml-8">
                {segments.length > 0 ? `${segments.length} Segmente analysiert` : 'Skript in Segmente aufteilen'}
              </p>
            </div>
            
            <div className={`flex-1 rounded-lg p-4 border ${workflowStep === 'editing' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
              <div className="flex items-center mb-2">
                <span className={`flex items-center justify-center w-6 h-6 rounded-full mr-2 text-xs ${workflowStep === 'editing' ? 'bg-primary text-white' : workflowStep && ['processing', 'completed'].includes(workflowStep) ? 'bg-green-500 text-white' : 'bg-white/20 text-white/60'}`}>
                  {workflowStep && ['processing', 'completed'].includes(workflowStep) ? '✓' : '3'}
                </span>
                <span className="font-medium">Anpassen & Generieren</span>
              </div>
              <p className="text-sm text-white/60 ml-8">
                {matches.length > 0 ? 'Videos zugeordnet' : 'Noch keine Videos zugeordnet'}
              </p>
            </div>
            
            <div className={`flex-1 rounded-lg p-4 border ${workflowStep === 'completed' ? 'border-primary bg-primary/10' : 'border-white/10 bg-white/5'}`}>
              <div className="flex items-center mb-2">
                <span className={`flex items-center justify-center w-6 h-6 rounded-full mr-2 text-xs ${workflowStep === 'completed' ? 'bg-primary text-white' : 'bg-white/20 text-white/60'}`}>
                  {workflowStep === 'completed' ? '✓' : '4'}
                </span>
                <span className="font-medium">Fertig</span>
              </div>
              <p className="text-sm text-white/60 ml-8">
                Video generieren
              </p>
            </div>
          </div>
        </div>
      )}
      
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">Voiceover-Skript</h2>
        <div className="space-y-2">
          <label htmlFor="script" className="block text-sm font-medium">
            Skript für die Analyse
          </label>
          <textarea
            id="script"
            className="w-full min-h-[100px] bg-gray-800 border border-gray-700 rounded-md p-2 text-white"
            placeholder="Gib das Skript ein, für das du passende Videos finden möchtest..."
            value={script}
            onChange={(e) => setScript(e.target.value)}
            readOnly
          />
        </div>
        
        {/* Voiceover-Player */}
        {voiceoverData && (
          <div className="p-4 mt-4 bg-gray-800 border border-gray-700 rounded-md">
            <div className="flex items-center justify-between">
              <div className="font-medium">Dein Voiceover</div>
              <button
                onClick={togglePlay}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {isPlaying ? (
                  <>
                    <PauseIcon className="h-4 w-4 mr-2" />
                    Pause
                  </>
                ) : (
                  <>
                    <PlayIcon className="h-4 w-4 mr-2" />
                    Play
                  </>
                )}
              </button>
            </div>
            {projectId && (
              <div className="mt-2 text-xs text-gray-500">
                Projekt-ID: {projectId}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/30 text-red-400 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      <button 
        onClick={handleAnalyzeScript} 
        disabled={isAnalyzing || !script.trim()}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-md disabled:bg-blue-300 disabled:opacity-50 mb-6"
      >
        {isAnalyzing ? (
          <>
            <ArrowPathIcon className="inline-block h-4 w-4 mr-2 animate-spin" />
            Analysiere Skript...
          </>
        ) : (
          'Passende Videos finden'
        )}
      </button>

      {segments.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold">Skript-Analyse</h3>
          <p className="text-sm text-gray-400">
            Das Skript wurde in {segments.length} Segmente unterteilt.
            {totalVideos > 0 ? ` ${totalVideos} Videos mit Tags gefunden.` : ' Keine Videos mit Tags gefunden.'}
          </p>
          
          {totalVideos === 0 && (
            <div className="p-4 bg-yellow-900/30 border border-yellow-500/30 text-yellow-400 rounded-md">
              <h3 className="font-medium">Keine Videos mit Tags gefunden</h3>
              <p className="mt-2">
                Um Videos automatisch zuzuordnen, musst du zuerst Videos hochladen und mit Tags versehen.
              </p>
              <Link
                href="/upload"
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block"
              >
                Zur Upload-Seite
              </Link>
            </div>
          )}
          
          <div className="space-y-4">
            {segments.map((segment, index) => {
              const match = matches.find(m => m.segment.text === segment.text);
              
              return (
                <div key={index} className="border border-gray-700 bg-gray-800/50 rounded-md p-4">
                  <div className="flex justify-between items-start">
                    <h4 className="font-medium">Segment {index + 1}</h4>
                    <span className="text-sm text-gray-400">
                      Dauer: {segment.duration} Sekunden
                    </span>
                  </div>
                  
                  <p className="mt-2">{segment.text}</p>
                  
                  <div className="mt-2">
                    <span className="text-sm font-medium">Keywords: </span>
                    <span className="text-sm text-gray-400">
                      {segment.keywords.join(', ')}
                    </span>
                  </div>
                  
                  {match ? (
                    <div className="mt-4 border-t border-gray-700 pt-2">
                      <div className="flex justify-between items-start">
                        <h5 className="font-medium">Passendes Video</h5>
                        <span className="text-sm text-gray-400">
                          Match-Score: {Math.round(match.score * 100)}%
                        </span>
                      </div>
                      
                      <p className="mt-1 font-medium">{match.video.name}</p>
                      
                      <div className="mt-1">
                        <span className="text-sm font-medium">Tags: </span>
                        <span className="text-sm text-gray-400">
                          {match.video.tags.join(', ')}
                        </span>
                      </div>
                      
                      {match.video.duration && (
                        <div className="mt-1 text-sm">
                          <span className="font-medium">Video-Länge: </span>
                          <span className="text-gray-400">
                            {match.video.duration} Sekunden
                            {match.video.duration > segment.duration && 
                              ` (wird auf ${segment.duration} Sekunden gekürzt)`}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-4 border-t border-gray-700 pt-2 text-yellow-400">
                      Kein passendes Video gefunden
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {matches.length > 0 && (
            <button 
              onClick={handleContinueToEditor}
              disabled={isSaving}
              className="w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center"
            >
              {isSaving ? (
                <>
                  <ArrowPathIcon className="h-5 w-5 mr-2 animate-spin" />
                  Speichere Matches...
                </>
              ) : (
                <>
                  Weiter zum Video-Editor
                  <ArrowRightIcon className="ml-2 h-5 w-5" />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
} 