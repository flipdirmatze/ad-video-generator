'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Project = {
  id: string;
  status: string;
  outputUrl: string | null;
  createdAt: string;
  error: string | null;
};

export default function Profile() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-5xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Your Profile</h1>
          <p className="text-gray-400">
            Manage your account information and review your generated videos
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Sidebar with user info */}
          <div className="md:col-span-1">
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
                </div>
                <h2 className="text-xl font-bold">{session?.user?.name}</h2>
                <p className="text-gray-400">{session?.user?.email}</p>
                <p className="text-gray-500 text-sm mt-1">
                  Role: {session?.user?.role || 'User'}
                </p>
              </div>

              <div className="space-y-4">
                <Link
                  href="/editor"
                  className="block w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg text-center transition-colors"
                >
                  Create New Ad
                </Link>
                
                <Link
                  href="/profile/settings"
                  className="block w-full py-2 px-4 bg-gray-800 hover:bg-gray-700 rounded-lg text-center transition-colors"
                >
                  Account Settings
                </Link>

                <button
                  onClick={() => {
                    signOut({ callbackUrl: '/' });
                  }}
                  className="block w-full py-2 px-4 bg-red-900 hover:bg-red-800 rounded-lg text-center transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="md:col-span-2">
            <div className="bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-800 mb-8">
              <h2 className="text-xl font-bold mb-4">Your Generated Videos</h2>
              
              {userProjects.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-4">You haven't created any videos yet</p>
                  <Link
                    href="/editor"
                    className="inline-block py-2 px-6 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                  >
                    Create Your First Video
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
          </div>
        </div>
      </div>
    </div>
  );
} 