'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { SubscriptionPlan, IUserLimits } from '@/models/User';

// Logo Component
const Logo = () => (
  <Link href="/" className="flex items-center">
    <svg
      width="180"
      height="44"
      viewBox="0 0 180 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-8"
    >
      <path
        d="M16 0C7.164 0 0 7.164 0 16V28C0 36.837 7.164 44 16 44H28C36.837 44 44 36.837 44 28V16C44 7.164 36.837 0 28 0H16Z"
        fill="url(#paint0_linear_1_3)"
      />
      <path
        d="M16.5 10.7C20.9 4.3 30.5 6.6 32 14.5L21.6 20L28.5 31.5C21.3 35.9 12.6 31.3 12.5 23C12.5 18.3 14 13.7 16.5 10.7Z"
        fill="white"
      />
      <path
        d="M63.672 31.288C60.776 31.288 58.312 30.472 56.28 28.84C54.248 27.208 53.016 24.968 52.584 22.12H58.504C58.776 23.496 59.448 24.6 60.52 25.432C61.592 26.232 62.952 26.632 64.6 26.632C66.136 26.632 67.352 26.28 68.248 25.576C69.176 24.84 69.64 23.912 69.64 22.792C69.64 21.352 69.08 20.328 67.96 19.72C66.872 19.112 65.144 18.44 62.776 17.704C60.552 17.032 58.792 16.376 57.496 15.736C56.2 15.096 55.064 14.136 54.088 12.856C53.144 11.576 52.672 9.896 52.672 7.816C52.672 6.152 53.112 4.664 53.992 3.352C54.872 2.008 56.152 0.968 57.832 0.232C59.544 -0.504 61.544 -0.872 63.832 -0.872C67.288 -0.872 70.024 -0.04 72.04 1.624C74.088 3.288 75.272 5.624 75.592 8.632H69.8C69.544 7.352 68.904 6.328 67.88 5.56C66.856 4.792 65.528 4.408 63.896 4.408C62.392 4.408 61.224 4.76 60.392 5.464C59.56 6.136 59.144 7.048 59.144 8.2C59.144 9.32 59.496 10.216 60.2 10.888C60.904 11.56 61.768 12.104 62.792 12.52C63.816 12.904 65.192 13.352 66.92 13.864C69.048 14.504 70.744 15.16 72.008 15.832C73.304 16.472 74.44 17.416 75.416 18.664C76.392 19.912 76.88 21.544 76.88 23.56C76.88 25.096 76.44 26.552 75.56 27.928C74.68 29.304 73.384 30.424 71.672 31.288C69.992 31.288 66.6 31.288 63.672 31.288Z"
        fill="#161616"
      />
      <path
        d="M97.6721 7.128C99.8401 7.128 101.752 7.64 103.408 8.664C105.096 9.688 106.408 11.128 107.344 12.984C108.28 14.84 108.748 16.984 108.748 19.416C108.748 21.848 108.28 23.992 107.344 25.848C106.408 27.704 105.096 29.144 103.408 30.168C101.752 31.192 99.8401 31.704 97.6721 31.704C94.5841 31.704 92.1201 30.664 90.2801 28.584V40.04H83.9361V7.432H90.0241V10.424C90.8881 9.272 91.9921 8.376 93.3361 7.736C94.6801 7.096 96.1281 6.776 97.6721 7.128ZM96.8081 26.344C98.7201 26.344 100.272 25.688 101.464 24.376C102.656 23.064 103.252 21.4 103.252 19.384C103.252 17.368 102.656 15.72 101.464 14.44C100.272 13.128 98.7201 12.472 96.8081 12.472C95.6801 12.472 94.6641 12.76 93.7601 13.336C92.8881 13.88 92.1841 14.648 91.6481 15.64C91.1121 16.632 90.8441 17.832 90.8441 19.24C90.8441 20.648 91.1121 21.864 91.6481 22.888C92.1841 23.88 92.8881 24.664 93.7601 25.24C94.6641 25.784 95.6801 26.344 96.8081 26.344Z"
        fill="#161616"
      />
      <path
        d="M134.248 7.432V31H128.224V27.88C127.36 29 126.248 29.864 124.888 30.472C123.56 31.08 122.12 31.384 120.568 31.384C118.712 31.384 117.064 30.984 115.624 30.184C114.184 29.352 113.064 28.168 112.264 26.632C111.464 25.096 111.064 23.304 111.064 21.256V7.432H117.408V20.2C117.408 22.024 117.872 23.432 118.8 24.424C119.728 25.416 120.984 25.912 122.568 25.912C124.152 25.912 125.424 25.416 126.384 24.424C127.344 23.432 127.824 22.024 127.824 20.2V7.432H134.248Z"
        fill="#161616"
      />
      <path
        d="M161.472 19.192C161.472 19.896 161.424 20.632 161.328 21.4H143.936C144.064 23.16 144.656 24.52 145.712 25.48C146.768 26.44 148.08 26.92 149.648 26.92C151.952 26.92 153.568 25.96 154.496 24.04H160.768C160.128 26.152 158.848 27.912 156.928 29.32C155.008 30.696 152.624 31.384 149.776 31.384C147.456 31.384 145.376 30.872 143.536 29.848C141.728 28.824 140.304 27.384 139.264 25.528C138.256 23.672 137.752 21.544 137.752 19.144C137.752 16.712 138.256 14.568 139.264 12.712C140.272 10.856 141.68 9.416 143.488 8.392C145.296 7.368 147.392 6.856 149.776 6.856C152.064 6.856 154.08 7.352 155.824 8.344C157.6 9.336 158.976 10.728 159.952 12.52C160.96 14.28 161.472 16.536 161.472 19.192ZM155.16 17.24C155.128 15.672 154.592 14.424 153.552 13.496C152.512 12.568 151.216 12.104 149.664 12.104C148.176 12.104 146.928 12.568 145.92 13.496C144.912 14.392 144.288 15.64 144.048 17.24H155.16Z"
        fill="#161616"
      />
      <path
        d="M167.328 3.944C166.352 3.944 165.536 3.624 164.88 2.984C164.256 2.312 163.944 1.496 163.944 0.536C163.944 -0.424 164.256 -1.256 164.88 -1.928C165.536 -2.568 166.352 -2.888 167.328 -2.888C168.272 -2.888 169.056 -2.568 169.68 -1.928C170.336 -1.256 170.664 -0.424 170.664 0.536C170.664 1.496 170.336 2.312 169.68 2.984C169.056 3.624 168.272 3.944 167.328 3.944ZM170.456 7.432V31H164.112V7.432H170.456Z"
        fill="#161616"
      />
      <path
        d="M185.528 12.92C187.352 8.648 190.936 7.128 194.12 7.128C196.28 7.128 198.2 7.64 199.88 8.664C201.56 9.688 202.872 11.128 203.816 12.984C204.76 14.84 205.232 16.984 205.232 19.416C205.232 21.848 204.76 23.992 203.816 25.848C202.872 27.704 201.56 29.144 199.88 30.168C198.2 31.192 196.28 31.704 194.12 31.704C190.936 31.704 187.352 30.184 185.528 25.912V40.04H179.176V7.432H185.528V12.92ZM193.232 26.344C195.152 26.344 196.704 25.688 197.904 24.376C199.104 23.064 199.704 21.4 199.704 19.384C199.704 17.368 199.104 15.72 197.904 14.44C196.704 13.128 195.152 12.472 193.232 12.472C192.104 12.472 191.08 12.76 190.168 13.336C189.288 13.88 188.576 14.648 188.032 15.64C187.488 16.632 187.216 17.832 187.216 19.24C187.216 20.648 187.488 21.864 188.032 22.888C188.576 23.88 189.288 24.664 190.168 25.24C191.08 25.784 192.104 26.344 193.232 26.344Z"
        fill="#161616"
      />
      <path
        d="M223.752 31.384C221.368 31.384 219.24 30.872 217.368 29.848C215.528 28.824 214.072 27.384 213 25.528C211.96 23.672 211.44 21.544 211.44 19.144C211.44 16.776 211.976 14.664 213.048 12.808C214.152 10.952 215.64 9.512 217.512 8.488C219.384 7.464 221.528 6.952 223.944 6.952C226.36 6.952 228.504 7.464 230.376 8.488C232.248 9.512 233.72 10.952 234.792 12.808C235.896 14.664 236.448 16.776 236.448 19.144C236.448 21.512 235.88 23.624 234.744 25.48C233.64 27.336 232.136 28.792 230.232 29.848C228.328 30.872 226.168 31.384 223.752 31.384ZM223.752 26.056C224.904 26.056 225.96 25.784 226.92 25.24C227.912 24.664 228.704 23.848 229.296 22.792C229.888 21.736 230.184 20.52 230.184 19.144C230.184 17.096 229.576 15.496 228.36 14.344C227.176 13.16 225.672 12.568 223.848 12.568C222.024 12.568 220.52 13.16 219.336 14.344C218.184 15.496 217.608 17.096 217.608 19.144C217.608 21.192 218.168 22.808 219.288 23.992C220.44 25.176 221.928 26.056 223.752 26.056Z"
        fill="#161616"
      />
      <path
        d="M256.04 6.952C258.584 6.952 260.648 7.736 262.232 9.304C263.848 10.84 264.656 13.032 264.656 15.88V31H258.344V16.808C258.344 15.112 257.896 13.8 257 12.872C256.104 11.944 254.888 11.48 253.352 11.48C251.816 11.48 250.6 11.944 249.704 12.872C248.808 13.8 248.36 15.112 248.36 16.808V31H242.016V7.432H248.36V10.232C249.192 9.272 250.232 8.536 251.48 8.024C252.76 7.144 254.328 6.952 256.04 6.952Z"
        fill="#161616"
      />
      <defs>
        <linearGradient
          id="paint0_linear_1_3"
          x1="22"
          y1="0"
          x2="22"
          y2="44"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
    </svg>
  </Link>
);

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

  // Standardlimits für verschiedene Abonnements wenn userLimits nicht verfügbar sind
  const getDefaultPlanLimits = (plan: SubscriptionPlan): IUserLimits => {
    const planLimits: Record<SubscriptionPlan, IUserLimits> = {
      free: {
        maxVideosPerMonth: 0,
        maxVideoLength: 0,
        maxStorageSpace: 0,
        maxResolution: "360p",
        maxUploadSize: 0,
        allowedFeatures: []
      },
      starter: {
        maxVideosPerMonth: 10,
        maxVideoLength: 180, // 3 Minuten
        maxStorageSpace: 1024 * 1024 * 1024 * 2, // 2 GB
        maxResolution: "720p", // SD
        maxUploadSize: 150 * 1024 * 1024, // 150MB
        allowedFeatures: ["templates"]
      },
      pro: {
        maxVideosPerMonth: 50,
        maxVideoLength: 600, // 10 Minuten
        maxStorageSpace: 1024 * 1024 * 1024 * 10, // 10 GB
        maxResolution: "1080p", // HD
        maxUploadSize: 500 * 1024 * 1024, // 500MB
        allowedFeatures: ["templates"]
      },
      business: {
        maxVideosPerMonth: 200,
        maxVideoLength: 1800, // 30 Minuten
        maxStorageSpace: 1024 * 1024 * 1024 * 50, // 50 GB
        maxResolution: "2160p", // 4K
        maxUploadSize: 2 * 1024 * 1024 * 1024, // 2GB
        allowedFeatures: ["templates"]
      }
    };
    
    return planLimits[plan];
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
  const userLimits = session?.user?.limits || getDefaultPlanLimits(userPlan);
  const userStats = session?.user?.stats || { totalVideosCreated: 0, totalStorage: 0, lastActive: new Date() };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <Logo />
            <h1 className="text-3xl font-bold mb-2 mt-4">Dein Profil</h1>
            <p className="text-gray-400">
              Verwalte deine Konto-Informationen und sehe deine erstellten Videos
            </p>
          </div>
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
                  <p className="text-xs text-gray-500">von {userLimits?.maxVideosPerMonth} pro Monat</p>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg">
                  <p className="text-gray-400 text-xs mb-1">Speicherplatz</p>
                  <p className="text-xl font-semibold">{formatBytes(userStats?.totalStorage || 0)}</p>
                  <p className="text-xs text-gray-500">von {formatBytes(userLimits?.maxStorageSpace)}</p>
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
                              {userStats?.totalVideosCreated || 0} / {userLimits?.maxVideosPerMonth}
                            </span>
                          </div>
                          <div className="w-full bg-gray-700 rounded-full h-2.5">
                            <div 
                              className="bg-purple-600 h-2.5 rounded-full" 
                              style={{ 
                                width: `${Math.min(
                                  ((userStats?.totalVideosCreated || 0) / (userLimits?.maxVideosPerMonth || 1)) * 100, 
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
                              {formatBytes(userStats?.totalStorage || 0)} / {formatBytes(userLimits?.maxStorageSpace)}
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