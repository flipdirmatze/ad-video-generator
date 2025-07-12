'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ScriptSegment } from '@/lib/openai'
import { VideoMatch } from '@/utils/tag-matcher'
import { PlayIcon, PauseIcon, ArrowRightIcon, ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, FilmIcon } from '@heroicons/react/24/outline'
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
  const [availableVideos, setAvailableVideos] = useState<{id: string, name: string, url: string, tags: string[]}[]>([])
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null)
  const videoRefs = useRef<{[key: string]: HTMLVideoElement}>({})
  const [loadingVideoIds, setLoadingVideoIds] = useState<Set<string>>(new Set())
  const [errorVideoIds, setErrorVideoIds] = useState<Set<string>>(new Set())

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

  // Videos aus der Datenbank laden
  useEffect(() => {
    const fetchVideos = async () => {
      try {
        const response = await fetch('/api/media')
        if (response.ok) {
          const data = await response.json()
          if (data.files?.length > 0) {
            console.log('Loaded videos:', data.files.length);
            setAvailableVideos(data.files.map((file: any) => ({
              id: file.id,
              name: file.name,
              url: file.url,
              tags: file.tags || [],
            })))
          } else {
            console.log('No videos found in response');
          }
        } else {
          console.error('Error fetching videos:', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Error loading videos:', error)
      }
    }
    
    fetchVideos()
  }, [])

  // Ensure video elements are properly initialized when video URLs change
  useEffect(() => {
    if (availableVideos.length > 0) {
      console.log(`${availableVideos.length} videos loaded, initializing video elements`);
      
      // Sofortiges Update der Video-Elemente
      setTimeout(() => {
        // Finde alle Matches mit Videoreferenzen
        matches.forEach(match => {
          if (match && match.video && match.video.id) {
            const videoElement = videoRefs.current[match.video.id];
            const videoData = availableVideos.find(v => v.id === match.video.id);
            
            // Stelle sicher, dass wir sowohl das Element als auch die Daten haben
            if (videoElement && videoData && videoData.url) {
              console.log(`Initializing video ${match.video.id} with URL ${videoData.url}`);
              
              // Versuche das Video zu laden
              videoElement.src = videoData.url;
              videoElement.load();
              
              // CORS-Einstellungen
              videoElement.crossOrigin = "anonymous";
              
              // Event-Listener für besseres Fehler-Handling
              const errorHandler = (e: any) => {
                console.error(`Video error for ${match.video.id}:`, e);
                // Wenn es ein CORS-Problem sein könnte, versuche erneut mit anderer CORS-Einstellung
                if (e.name === 'NotSupportedError') {
                  console.log('Possible CORS issue, trying with different settings');
                  videoElement.crossOrigin = "use-credentials";
                  videoElement.load();
                }
              };
              
              // Event-Listener entfernen und neu hinzufügen um Duplikate zu vermeiden
              videoElement.removeEventListener('error', errorHandler);
              videoElement.addEventListener('error', errorHandler);
            }
          }
        });
      }, 500); // Kleiner Timeout für zuverlässigere Initialisierung
    }
  }, [availableVideos, matches]);

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
    if (!voiceoverData?.voiceoverId) {
      setError('Bitte erstelle zuerst ein Voiceover, um das Matching zu starten.')
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
        body: JSON.stringify({ voiceoverId: voiceoverData.voiceoverId })
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

  // Funktion zum manuellen Zuordnen eines Videos zu einem Segment
  const handleManualVideoSelect = (segmentIndex: number, videoId: string) => {
    if (!videoId) return;
    
    console.log(`Manuelles Video ausgewählt: ${videoId} für Segment ${segmentIndex}`);
    
    // Video-Daten finden
    const videoData = availableVideos.find(v => v.id === videoId);
    if (!videoData) {
      console.error(`Video mit ID ${videoId} nicht gefunden`);
      return;
    }
    
    // Segment aus zugeordneten Segmenten finden
    const segment = segments[segmentIndex];
    if (!segment) {
      console.error(`Segment mit Index ${segmentIndex} nicht gefunden`);
      return;
    }
    
    // Neuen Match erstellen oder vorhandenen ersetzen
    const newMatch: VideoMatch = {
      segment,
      video: videoData,
      score: 0,  // Manuell ausgewählt, daher keine automatische Bewertung
      source: 'manual'  // Hier markieren wir, dass es manuell ausgewählt wurde
    };
    
    setMatches(prevMatches => {
      // Filtern, um vorhandene Matches für dieses Segment zu entfernen
      const filteredMatches = prevMatches.filter(m => m.segment.text !== segment.text);
      // Füge neuen Match hinzu
      return [...filteredMatches, newMatch];
    });
  };

  // Funktion zum Aktualisieren des Ladestatus eines Videos
  const updateVideoLoadingState = (videoId: string, isLoading: boolean) => {
    setLoadingVideoIds(prev => {
      const newSet = new Set(prev)
      if (isLoading) {
        newSet.add(videoId)
      } else {
        newSet.delete(videoId)
      }
      return newSet
    })
  }

  // Funktion zum Aktualisieren des Fehlerstatus eines Videos
  const updateVideoErrorState = (videoId: string, hasError: boolean) => {
    setErrorVideoIds(prev => {
      const newSet = new Set(prev)
      if (hasError) {
        newSet.add(videoId)
      } else {
        newSet.delete(videoId)
      }
      return newSet
    })
  }

  // Funktion zum Abspielen eines Videos
  const playVideo = (videoId: string) => {
    console.log(`Attempting to play video with ID: ${videoId}`)
    
    // Setze Ladestatus für dieses Video
    updateVideoLoadingState(videoId, true)
    // Lösche eventuelle Fehlerstatus
    updateVideoErrorState(videoId, false)
    
    // Stoppe alle anderen Videos
    Object.values(videoRefs.current).forEach(videoEl => {
      if (videoEl) {
        videoEl.pause()
        videoEl.currentTime = 0
      }
    })
    
    // Get the video data
    const videoData = availableVideos.find(v => v.id === videoId)
    
    // Spiele das ausgewählte Video ab
    const videoElement = videoRefs.current[videoId]
    if (videoElement) {
      console.log(`Video element found for ID ${videoId}`, {
        src: videoElement.src,
        readyState: videoElement.readyState,
        paused: videoElement.paused
      })
      
      // Check if video URL is valid
      if (!videoElement.src && videoData?.url) {
        console.log(`Video has no source, setting URL: ${videoData.url}`)
        videoElement.src = videoData.url
        videoElement.load()
      }
      
      // Check if video URL is still valid by testing it
      if (videoData?.url && videoElement.src) {
        const checkVideoSource = async () => {
          try {
            // Try to fetch the URL to see if it's accessible
            const response = await fetch(videoData.url, { method: 'HEAD' })
            if (!response.ok) {
              console.warn(`Video URL might be invalid (status ${response.status}), trying to get fresh URL`)
              // Try to get a fresh URL from the server
              const freshUrlResponse = await fetch(`/api/media/${videoId}`)
              if (freshUrlResponse.ok) {
                const freshData = await freshUrlResponse.json()
                if (freshData.url) {
                  console.log(`Got fresh URL for video ${videoId}:`, freshData.url)
                  videoElement.src = freshData.url
                  videoElement.load()
                }
              }
            }
          } catch (error) {
            console.error('Error checking video URL:', error)
          }
        }
        
        // Only check if there's an issue with the video
        if (videoElement.readyState === 0) {
          checkVideoSource().catch(console.error)
        }
      }
      
      if (playingVideoId === videoId) {
        // Wenn das Video bereits abspielt, pause es
        console.log(`Pausing video ${videoId}`);
        videoElement.pause();
        setPlayingVideoId(null);
      } else {
        // Sonst spiele es ab
        console.log(`Playing video ${videoId}`);
        
        // Ensure video is loaded before playing
        if (videoElement.readyState === 0) {
          console.log(`Video not loaded yet, loading...`);
          videoElement.load();
        }
        
        videoElement.play().catch(error => {
          console.error('Error playing video:', error)
          // Fehlerstatus setzen
          updateVideoErrorState(videoId, true)
          // If the video has no source, try to reload it
          if (error.name === 'NotSupportedError' || videoElement.src === '') {
            console.log('Video source may be invalid, attempting to reload...');
            // Find the video data
            const videoData = availableVideos.find(v => v.id === videoId);
            if (videoData && videoData.url) {
              console.log(`Reloading video with URL: ${videoData.url}`);
              videoElement.src = videoData.url;
              videoElement.load();
              videoElement.play().catch(err => 
                console.error('Still unable to play video after reload:', err)
              );
            }
          }
        }).finally(() => {
          // Loading-Status beenden
          updateVideoLoadingState(videoId, false)
        });
        setPlayingVideoId(videoId);
      }
    } else {
      console.error(`Video element not found for ID: ${videoId}`);
    }
  };
  
  // Funktion, um eine Referenz zu einem Video-Element zu speichern
  const setVideoRef = (id: string, element: HTMLVideoElement | null) => {
    if (element) {
      // Check if we need to assign or update the source
      const existingElement = videoRefs.current[id];
      const isNewElement = !existingElement || existingElement !== element;
      
      videoRefs.current[id] = element;
      
      // If this is a new video element, initialize it
      if (isNewElement) {
        console.log(`Setting up new video element for ID: ${id}`);
        
        // Find the corresponding video data
        const videoData = availableVideos.find(v => v.id === id);
        if (videoData && videoData.url && (!element.src || element.src === '')) {
          console.log(`Setting source for video ${id}: ${videoData.url}`);
          
          // Stelle sicher, dass das Video korrekt geladen wird
          try {
            element.src = videoData.url;
            element.crossOrigin = "anonymous"; // CORS-Einstellung
            element.load();
            
            // Manuell Ladevorgang starten
            updateVideoLoadingState(id, true);
            
            // Eventlistener hinzufügen
            const loadHandler = () => {
              console.log(`Video ${id} loaded successfully`);
              updateVideoLoadingState(id, false);
            };
            
            const errorHandler = (e: any) => {
              console.error(`Video ${id} failed to load:`, e);
              
              // Versuche erneut mit anderen CORS-Einstellungen
              if (e.name === 'NotSupportedError') {
                console.log('Possible CORS issue, trying alternatives');
                element.crossOrigin = "use-credentials";
                element.load();
              } else {
                updateVideoLoadingState(id, false);
              }
            };
            
            // Event-Listener entfernen und neu hinzufügen
            element.removeEventListener('canplaythrough', loadHandler);
            element.removeEventListener('error', errorHandler);
            
            element.addEventListener('canplaythrough', loadHandler);
            element.addEventListener('error', errorHandler);
          } catch (err) {
            console.error(`Error setting up video ${id}:`, err);
            updateVideoLoadingState(id, false);
          }
        }
      }
    }
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
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        Script-Video Matcher
      </h1>

      {/* Workflow-Tipp Box statt Workflow Status */}
      <div className="mt-6 p-4 rounded-lg bg-blue-900/20 border border-blue-700/20 text-blue-400">
        <h3 className="font-medium">Workflow-Tipp</h3>
        <p className="mt-1">
          Hier kannst du dein Voiceover-Skript analysieren lassen und automatisch passende Videos aus deiner Bibliothek finden.
          Die KI teilt dein Skript in Segmente und ordnet Videos basierend auf ihren Tags zu.
        </p>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold">Dein Voiceover-Skript</h2>
        <div className="space-y-2">
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
          <div className="p-4 mt-4 mb-6 bg-gray-800 border border-gray-700 rounded-md max-w-md">
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
        disabled={isAnalyzing || !voiceoverData?.voiceoverId}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-md disabled:bg-blue-300 disabled:opacity-50 mb-6"
      >
        {isAnalyzing ? (
          <>
            <ArrowPathIcon className="inline-block h-4 w-4 mr-2 animate-spin" />
            Analysiere Skript...
          </>
        ) : (
          <>
            <svg className="inline-block w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.0489 1.92705C11.3483 0.826738 12.6517 0.826741 12.9511 1.92705L14.0206 6.52295C14.1545 7.0999 14.7018 7.48751 15.2945 7.44986L19.9947 7.13864C21.1346 7.06851 21.6408 8.29853 20.7229 8.91631L16.8888 11.6195C16.3968 11.9631 16.1773 12.5913 16.3489 13.1563L17.8345 17.6377C18.1892 18.7155 17.1255 19.5934 16.1829 19.0172L12.1527 16.6619C11.6354 16.3332 10.9946 16.3547 10.5003 16.7181L6.62081 19.8878C5.76041 20.5929 4.6082 19.8214 4.88892 18.7459L5.91194 14.1354C6.03657 13.5468 5.77431 12.9458 5.25895 12.6468L1.25946 10.3119C0.280989 9.80513 0.494767 8.42331 1.61338 8.27552L6.23479 7.58215C6.81873 7.49702 7.29585 7.06069 7.3694 6.47571L8.02533 1.82335C8.19688 0.70809 9.4493 0.340437 10.1353 1.20932L13.0458 5.03929C13.3664 5.45534 13.9352 5.60845 14.4201 5.41614L18.8476 3.80642C19.9122 3.43222 20.6909 4.57165 20.053 5.50171L17.698 9.29488C17.3589 9.80721 17.443 10.4886 17.907 10.8929L21.6344 14.0051C22.5449 14.7584 22.0487 16.1606 20.9362 16.237L16.4503 16.5275C15.8723 16.563 15.4016 17.0057 15.2897 17.5743L14.6315 22.0089C14.4679 23.1288 13.1222 23.4401 12.5023 22.5056L9.80967 18.5022C9.51414 18.0597 8.9374 17.9068 8.45158 18.1303L4.09599 20.0308C3.05406 20.4539 2.20051 19.3661 2.78945 18.414L4.93132 14.5273C5.23898 13.9852 5.10751 13.3182 4.61289 12.9307L0.803083 9.97473C-0.139491 9.27431 0.287843 7.80451 1.42395 7.66468L5.59492 7.13586C6.1773 7.06558 6.64587 6.5895 6.75432 6.01303L7.77252 1.48042C7.98063 0.370698 9.30736 0.0932136 9.93606 1.05224L12.6213 5.05172C12.9263 5.49987 13.5146 5.6433 13.9919 5.41798L18.3669 3.50446" 
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Passende Videos zu deinem Skript finden
          </>
        )}
      </button>

      {segments.length > 0 && (
        <div className="space-y-6">
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
          
          {/* Visuelle Timeline für die Segmente und zugeordneten Videos */}
          <div className="mt-8 space-y-8">
            <h4 className="text-lg font-medium">Vorschau der Videozuordnung</h4>
            
            {/* Segmente und Videos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
              {segments.map((segment, index) => {
                const match = matches.find(m => m.segment.text === segment.text);
                
                return (
                  <div 
                    key={index} 
                    className="bg-gray-800/50 border border-gray-700 rounded-md overflow-hidden"
                  >
                    {/* Segment-Box */}
                    <div className="p-4 border-b border-gray-700">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-white/90">Segment {index + 1}</span>
                        <span className="text-xs bg-gray-700/80 rounded px-2 py-0.5">
                          {segment.duration}s
                        </span>
                      </div>
                      <p className="text-sm mb-2 line-clamp-2">{segment.text}</p>
                      <div className="flex flex-wrap gap-1">
                        {segment.keywords.map((keyword, kIdx) => (
                          <span 
                            key={kIdx} 
                            className="text-xs bg-purple-900/30 border border-purple-700/30 text-purple-400 rounded px-1.5 py-0.5"
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                    
                    {/* Video-Thumbnail und Info */}
                    <div className="p-3">
                      {match ? (
                        <div>
                          <div className="mb-2 flex justify-between items-center">
                            <div className="text-sm font-medium flex items-center">
                              <span className={`px-1.5 py-0.5 text-xs rounded mr-2 ${match.source === 'manual' ? 'bg-purple-500/30 text-purple-300' : 'bg-green-500/30 text-green-300'}`}>
                                {match.source === 'manual' ? 'Manuell' : `${Math.round(match.score * 100)}% Match`}
                              </span>
                            </div>
                          </div>
                          
                          <div className="relative aspect-video bg-gray-900/50 rounded overflow-hidden mb-2">
                            {match.video.url ? (
                              <div className="relative w-full h-full">
                                {/* Video-Element für die Wiedergabe */}
                                <video
                                  ref={(el) => setVideoRef(match.video.id, el)}
                                  className="absolute inset-0 w-full h-full object-cover"
                                  muted
                                  playsInline
                                  preload="metadata"
                                  crossOrigin="anonymous"
                                  onLoadStart={() => updateVideoLoadingState(match.video.id, true)}
                                  onCanPlay={() => updateVideoLoadingState(match.video.id, false)}
                                  onEnded={() => setPlayingVideoId(null)}
                                  onError={(e) => {
                                    console.error(`Video error for ${match.video.id}:`, e);
                                    // Versuche es mit einer neuen URL, falls das Video nicht geladen werden kann
                                    const videoElement = e.currentTarget as HTMLVideoElement;
                                    if (!videoElement.src || videoElement.src === '') {
                                      const videoData = availableVideos.find(v => v.id === match.video.id);
                                      if (videoData && videoData.url) {
                                        console.log(`Retrying with URL: ${videoData.url}`);
                                        videoElement.src = videoData.url;
                                        videoElement.load();
                                      }
                                    }
                                  }}
                                />
                                
                                {/* Play-Button und Overlay */}
                                <div 
                                  className="absolute inset-0 bg-black/40 flex items-center justify-center cursor-pointer"
                                  onClick={() => playVideo(match.video.id)}
                                >
                                  {loadingVideoIds.has(match.video.id) ? (
                                    <ArrowPathIcon className="h-8 w-8 text-white/80 animate-spin" />
                                  ) : playingVideoId === match.video.id ? (
                                    <PauseIcon className="h-8 w-8 text-white/80" />
                                  ) : (
                                    <PlayIcon className="h-8 w-8 text-white/80" />
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <FilmIcon className="h-8 w-8 text-gray-600" />
                              </div>
                            )}
                          </div>
                          
                          <p className="text-sm font-medium truncate">{match.video.name}</p>
                          
                          <div className="mt-1 flex flex-wrap gap-1">
                            {match.video.tags.map((tag, tIdx) => (
                              <span 
                                key={tIdx} 
                                className="text-xs bg-blue-900/30 border border-blue-700/30 text-blue-400 rounded px-1.5 py-0.5"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                          
                          {match.video.duration && segment.duration < match.video.duration && (
                            <div className="mt-2 text-xs text-yellow-400">
                              Video wird von {match.video.duration}s auf {segment.duration}s gekürzt
                            </div>
                          )}
                          
                          {/* Video-Auswahl Dropdown unter dem Video */}
                          <div className="mt-3">
                            <label className="block text-xs text-gray-400 mb-1">Video austauschen:</label>
                            <select 
                              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                              onChange={(e) => handleManualVideoSelect(index, e.target.value)}
                              value={match.video.id}
                            >
                              <option value={match.video.id}>{match.source === 'manual' ? 'Manuell ausgewählt' : 'Auto-Match'}</option>
                              <option disabled>──────────</option>
                              {availableVideos.map(video => (
                                <option key={video.id} value={video.id} disabled={video.id === match.video.id}>
                                  {video.name} {video.tags.length > 0 ? `(Tags: ${video.tags.join(', ')})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-center text-yellow-400 py-3 mb-2">
                            <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
                            Kein passendes Video gefunden
                          </div>
                          
                          {/* Video-Auswahl Dropdown */}
                          <div className="mt-3">
                            <label className="block text-xs text-gray-400 mb-1">Video manuell auswählen:</label>
                            <select 
                              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                              onChange={(e) => handleManualVideoSelect(index, e.target.value)}
                              defaultValue=""
                            >
                              <option value="" disabled>Video auswählen...</option>
                              {availableVideos.map(video => (
                                <option key={video.id} value={video.id}>
                                  {video.name} {video.tags.length > 0 ? `(Tags: ${video.tags.join(', ')})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
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