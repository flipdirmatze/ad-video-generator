'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SubscriptionPlan } from '@/models/User';

type Project = {
  id: string;
  status: string;
  outputUrl: string | null;
  createdAt: string;
  error: string | null;
};

// Formatierungsfunktion für Bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export default function Profile() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'videos' | 'stats' | 'settings'>('videos');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    } else if (status === 'authenticated') {
      // Fetch user's projects
      fetchUserProjects();
    }
  }, [status, router]);

  const fetchUserProjects = async () => {
    try {
      const response = await fetch('/api/user/projects');
      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }
      const data = await response.json();
      setUserProjects(data.projects);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching projects:', error);
      setLoading(false);
    }
  };

  // Aktuelles Datum formatieren
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Status-Label mit Farbe
  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, { label: string, color: string }> = {
      'PENDING': { label: 'Ausstehend', color: 'bg-yellow-500' },
      'PROCESSING': { label: 'In Bearbeitung', color: 'bg-blue-500' },
      'COMPLETED': { label: 'Fertig', color: 'bg-green-500' },
      'FAILED': { label: 'Fehler', color: 'bg-red-500' }
    };
    
    const defaultStatus = { label: status, color: 'bg-gray-500' };
    return statusMap[status] || defaultStatus;
  };

  // Plan-Eigenschaften
  const getPlanDetails = (plan: SubscriptionPlan) => {
    const planMap: Record<SubscriptionPlan, { label: string, color: string, description: string }> = {
      'free': {
        label: 'Free',
        color: 'bg-gray-600',
        description: 'Eingeschränkte Testversion'
      },
      'starter': { 
        label: 'Starter', 
        color: 'bg-blue-600', 
        description: 'Basis-Features für Einsteiger'
      },
      'pro': { 
        label: 'Pro', 
        color: 'bg-purple-600',
        description: 'Erweiterte Funktionen und mehr Nutzungskontingent'
      },
      'business': { 
        label: 'Business', 
        color: 'bg-amber-600', 
        description: 'Maximale Funktionalität für Unternehmen'
      }
    };
    
    return planMap[plan] || planMap.starter;
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xl text-gray-300">Loading profile...</p>
        </div>
      </div>
    );
  }

  const userPlan = session?.user?.subscriptionPlan as SubscriptionPlan || 'starter';
  const planDetails = getPlanDetails(userPlan);
  const userLimits = session?.user?.limits;
  const userStats = session?.user?.stats;

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Dein Profil</h1>
          <p className="text-gray-400">
            Verwalte deine Konto-Informationen und sehe deine erstellten Videos
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Sidebar with user info */}
          <div className="md:col-span-4">
            <div className="bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-800">
              <div className="flex flex-col items-center text-center mb-6">
                <div className="relative w-24 h-24 mb-4">
                  {session?.user?.image ? (
                    <img
                      src={session.user.image}
                      alt={session.user.name || 'User'}
                      className="rounded-full w-full h-full object-cover"
                    />
                  ) : (
                    <div className="bg-purple-600 rounded-full w-full h-full flex items-center justify-center text-2xl font-bold">
                      {session?.user?.name?.charAt(0) || 'U'}
                    </div>
                  )}
                  <span className={`absolute bottom-0 right-0 w-6 h-6 ${planDetails.color} border-2 border-gray-900 rounded-full`}></span>
                </div>
                <h2 className="text-xl font-bold">{session?.user?.name}</h2>
                <p className="text-gray-400 text-sm">{session?.user?.email}</p>
                {session?.user?.username && (
                  <p className="text-gray-500 text-sm">@{session.user.username}</p>
                )}

                <div className="mt-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${planDetails.color}`}>
                    {planDetails.label}
                  </span>
                  {session?.user?.role === 'admin' && (
                    <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-800">
                      Admin
                    </span>
                  )}
                </div>
                
                <p className="mt-2 text-xs text-gray-500">{planDetails.description}</p>
              </div>

              {/* Membership Status */}
              <div className="mb-6 p-4 bg-gray-800 rounded-lg">
                <h3 className="text-sm font-semibold mb-2">Mitgliedschaft</h3>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Status:</span>
                  <span className={session?.user?.subscriptionActive ? "text-green-400" : "text-red-400"}>
                    {session?.user?.subscriptionActive ? "Aktiv" : "Inaktiv"}
                  </span>
                </div>
                
                {/* Zeige Ablaufdatum und Upgrade-Button für nicht-Enterprise-Nutzer */}
                {userPlan !== 'business' && (
                  <div className="mt-3">
                    <Link
                      href="/pricing"
                      className="block w-full text-center text-xs py-1.5 px-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 rounded transition-colors"
                    >
                      Upgrade auf {userPlan === 'starter' ? 'Pro' : 'Business'}
                    </Link>
                  </div>
                )}
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-gray-800 rounded-lg">
                  <p className="text-gray-400 text-xs mb-1">Videos erstellt</p>
                  <p className="text-xl font-semibold">{userStats?.totalVideosCreated || 0}</p>
                  <p className="text-xs text-gray-500">von {userLimits?.maxVideosPerMonth || 5} pro Monat</p>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg">
                  <p className="text-gray-400 text-xs mb-1">Speicherplatz</p>
                  <p className="text-xl font-semibold">{formatBytes(userStats?.totalStorage || 0)}</p>
                  <p className="text-xs text-gray-500">von {formatBytes(userLimits?.maxStorageSpace || 0)}</p>
                </div>
              </div>

              <div className="space-y-4">
                <Link
                  href="/editor"
                  className="block w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-center transition-colors"
                >
                  Neues Video erstellen
                </Link>
                
                <button
                  onClick={() => {
                    signOut({ callbackUrl: '/' });
                  }}
                  className="block w-full py-2 px-4 bg-red-900 hover:bg-red-800 rounded-lg text-center transition-colors"
                >
                  Abmelden
                </button>
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="md:col-span-8">
            <div className="bg-gray-900 rounded-xl shadow-lg border border-gray-800 overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-gray-800">
                <button 
                  onClick={() => setActiveTab('videos')}
                  className={`flex-1 py-3 px-4 text-sm font-medium text-center ${activeTab === 'videos' ? 'text-purple-500 border-b-2 border-purple-500' : 'text-gray-400 hover:text-gray-300'}`}
                >
                  Deine Videos
                </button>
                <button 
                  onClick={() => setActiveTab('stats')}
                  className={`flex-1 py-3 px-4 text-sm font-medium text-center ${activeTab === 'stats' ? 'text-purple-500 border-b-2 border-purple-500' : 'text-gray-400 hover:text-gray-300'}`}
                >
                  Nutzungsstatistik
                </button>
                <button 
                  onClick={() => setActiveTab('settings')}
                  className={`flex-1 py-3 px-4 text-sm font-medium text-center ${activeTab === 'settings' ? 'text-purple-500 border-b-2 border-purple-500' : 'text-gray-400 hover:text-gray-300'}`}
                >
                  Einstellungen
                </button>
              </div>
              
              {/* Videos Tab */}
              {activeTab === 'videos' && (
                <div className="p-6">
                  <h2 className="text-xl font-bold mb-4">Deine Videos</h2>
                  
                  {userProjects.length === 0 ? (
                    <div className="text-center py-12">
                      <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <p className="text-gray-400 mb-4">Du hast noch keine Videos erstellt</p>
                      <Link
                        href="/editor"
                        className="inline-block py-2 px-6 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                      >
                        Erstelle dein erstes Video
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {userProjects.map((project) => (
                        <div 
                          key={project.id} 
                          className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-gray-600 transition-colors"
                        >
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center space-x-2 mb-2">
                                <span 
                                  className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusLabel(project.status).color}`}
                                >
                                  {getStatusLabel(project.status).label}
                                </span>
                                <span className="text-gray-400 text-sm">
                                  {formatDate(project.createdAt)}
                                </span>
                              </div>
                              
                              {project.error && (
                                <p className="text-red-400 text-sm mb-2">{project.error}</p>
                              )}
                            </div>
                            
                            <div className="flex space-x-2">
                              {project.status === 'COMPLETED' && project.outputUrl && (
                                <>
                                  <a 
                                    href={project.outputUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm transition-colors"
                                  >
                                    Ansehen
                                  </a>
                                  <a 
                                    href={project.outputUrl} 
                                    download
                                    className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
                                  >
                                    Download
                                  </a>
                                </>
                              )}
                              
                              {project.status === 'FAILED' && (
                                <Link 
                                  href="/editor" 
                                  className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm transition-colors"
                                >
                                  Neu erstellen
                                </Link>
                              )}
                              
                              {(project.status === 'PENDING' || project.status === 'PROCESSING') && (
                                <button 
                                  className="px-3 py-1 bg-gray-700 rounded text-sm"
                                  disabled
                                >
                                  In Bearbeitung...
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* Stats Tab */}
              {activeTab === 'stats' && (
                <div className="p-6">
                  <h2 className="text-xl font-bold mb-4">Nutzungsstatistik</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Nutzungslimits Karte */}
                    <div className="bg-gray-800 p-5 rounded-lg">
                      <h3 className="font-semibold mb-3 text-purple-400">Deine Nutzungslimits</h3>
                      
                      <div className="space-y-4">
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-gray-400">Videos pro Monat</span>
                            <span className="text-sm font-medium">
                              {userStats?.totalVideosCreated || 0} / {userLimits?.maxVideosPerMonth || 5}
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2.5">
                            <div 
                              className="bg-purple-600 h-2.5 rounded-full" 
                              style={{ 
                                width: `${Math.min(
                                  ((userStats?.totalVideosCreated || 0) / (userLimits?.maxVideosPerMonth || 5)) * 100, 
                                  100
                                )}%` 
                              }}
                            ></div>
                          </div>
                        </div>
                        
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm text-gray-400">Speicherplatz</span>
                            <span className="text-sm font-medium">
                              {formatBytes(userStats?.totalStorage || 0)} / {formatBytes(userLimits?.maxStorageSpace || 0)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2.5">
                            <div 
                              className="bg-purple-600 h-2.5 rounded-full" 
                              style={{ 
                                width: `${Math.min(
                                  ((userStats?.totalStorage || 0) / (userLimits?.maxStorageSpace || 1)) * 100, 
                                  100
                                )}%` 
                              }}
                            ></div>
                          </div>
                        </div>
                        
                        <div className="pt-2">
                          <p className="text-sm text-gray-400 mb-2">Weitere Limits deines Plans:</p>
                          <ul className="space-y-1">
                            <li className="text-sm flex justify-between">
                              <span>Max. Videolänge:</span>
                              <span className="font-medium">{(userLimits?.maxVideoLength || 60) / 60} Minuten</span>
                            </li>
                            <li className="text-sm flex justify-between">
                              <span>Max. Auflösung:</span>
                              <span className="font-medium">{userLimits?.maxResolution || '720p'}</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </div>
                    
                    {/* Verfügbare Features */}
                    <div className="bg-gray-800 p-5 rounded-lg">
                      <h3 className="font-semibold mb-3 text-purple-400">Verfügbare Features</h3>
                      
                      <ul className="space-y-2">
                        {userLimits?.allowedFeatures?.map((feature, index) => (
                          <li key={index} className="flex items-center">
                            <svg className="w-4 h-4 mr-2 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-sm">
                              {feature === 'templates' && 'Vorlagennutzung'}
                              {feature === 'voiceover' && 'Professionelle Sprachausgabe'}
                              {feature === 'customBranding' && 'Eigenes Branding'}
                              {feature === 'apiAccess' && 'API-Zugriff'}
                              {feature === 'priorityProcessing' && 'Priorisierte Verarbeitung'}
                            </span>
                          </li>
                        ))}
                        
                        {userPlan !== 'business' && (
                          <>
                            {!userLimits?.allowedFeatures?.includes('customBranding') && (
                              <li className="flex items-center text-gray-500">
                                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                <span className="text-sm">Eigenes Branding</span>
                              </li>
                            )}
                            
                            {!userLimits?.allowedFeatures?.includes('apiAccess') && (
                              <li className="flex items-center text-gray-500">
                                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                <span className="text-sm">API-Zugriff</span>
                              </li>
                            )}
                          </>
                        )}
                      </ul>
                      
                      {userPlan !== 'business' && (
                        <div className="mt-4 pt-4 border-t border-gray-700">
                          <Link
                            href="/pricing"
                            className="text-sm text-purple-400 hover:text-purple-300 flex items-center"
                          >
                            <span>Mehr Features freischalten</span>
                            <svg className="ml-1 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Activity Info */}
                  <div className="bg-gray-800 p-5 rounded-lg">
                    <h3 className="font-semibold mb-3 text-purple-400">Aktivität</h3>
                    
                    <p className="text-sm text-gray-400 mb-3">
                      Du hast bisher <span className="font-medium text-white">{userStats?.totalVideosCreated || 0} Videos</span> erstellt.
                    </p>
                    
                    <p className="text-sm text-gray-400">
                      Zuletzt aktiv: {userStats?.lastActive ? formatDate(userStats.lastActive.toString()) : 'Heute'}
                    </p>
                  </div>
                </div>
              )}
              
              {/* Settings Tab */}
              {activeTab === 'settings' && (
                <div className="p-6">
                  <h2 className="text-xl font-bold mb-4">Kontoeinstellungen</h2>
                  
                  <div className="space-y-6">
                    {/* Coming Soon Message */}
                    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                      <p className="text-center text-sm text-gray-400">
                        Weitere Einstellungsoptionen werden bald verfügbar sein.
                      </p>
                    </div>
                    
                    {/* Account Security */}
                    <div className="bg-gray-800 rounded-lg p-5">
                      <h3 className="font-semibold mb-3">Kontosicherheit</h3>
                      
                      <div className="space-y-4">
                        <Link
                          href="/profile/change-password"
                          className="flex justify-between items-center text-sm p-3 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          <span>Passwort ändern</span>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                        
                        <Link
                          href="/profile/connected-accounts"
                          className="flex justify-between items-center text-sm p-3 border border-gray-700 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          <span>Verbundene Konten</span>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                    
                    {/* Danger Zone */}
                    <div className="bg-gray-800 rounded-lg p-5 border border-red-900">
                      <h3 className="font-semibold mb-3 text-red-500">Gefahrenzone</h3>
                      
                      <Link
                        href="/profile/delete-account"
                        className="flex justify-between items-center text-sm p-3 border border-red-900 rounded-lg text-red-500 hover:bg-red-900/20 transition-colors"
                      >
                        <span>Konto löschen</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 