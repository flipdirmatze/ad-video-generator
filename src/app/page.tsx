'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { ArrowRightIcon, CheckCircleIcon, SparklesIcon, VideoCameraIcon, SpeakerWaveIcon, TagIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'

type WorkflowStatus = {
  voiceover: boolean;
  videos: boolean;
  finalVideo: boolean;
}

// Main component that will be wrapped in Suspense
function HomeContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>({
    voiceover: false,
    videos: false,
    finalVideo: false
  });
  const [showSubscriptionWarning, setShowSubscriptionWarning] = useState(false);

  // Check if user has an active subscription
  const hasActiveSubscription = session?.user?.subscriptionActive && session?.user?.subscriptionPlan !== 'free';

  // Check for subscription_required parameter in URL
  useEffect(() => {
    if (searchParams.get('subscription_required') === 'true') {
      setShowSubscriptionWarning(true);
      
      // Remove the parameter from URL after showing the warning
      const url = new URL(window.location.href);
      url.searchParams.delete('subscription_required');
      window.history.replaceState({}, '', url.toString());
      
      // Auto-hide the warning after 5 seconds
      const timer = setTimeout(() => {
        setShowSubscriptionWarning(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Check localStorage for workflow progress
  useEffect(() => {
    if (status === 'authenticated') {
      const hasVoiceover = !!localStorage.getItem('voiceoverUrl');
      const hasVideos = !!localStorage.getItem('uploadedVideos');
      const hasFinalVideo = !!localStorage.getItem('finalVideoUrl');

      setWorkflowStatus({
        voiceover: hasVoiceover,
        videos: hasVideos,
        finalVideo: hasFinalVideo
      });
    }
  }, [status]);

  // Determine the next step in the workflow
  const getNextStep = () => {
    if (status !== 'authenticated') {
      return '/auth/signup';
    } else if (!hasActiveSubscription) {
      return '/pricing';
    } else if (!workflowStatus.voiceover) {
      return '/voiceover';
    } else if (!workflowStatus.videos) {
      return '/upload';
    } else if (!workflowStatus.finalVideo) {
      return '/editor';
    } else {
      return '/editor'; // Start a new project
    }
  };

  // Get button text based on workflow status
  const getButtonText = () => {
    if (status !== 'authenticated') {
      return 'Create Account';
    } else if (!hasActiveSubscription) {
      return 'Choose a Plan';
    } else if (workflowStatus.finalVideo) {
      return 'Create Another Ad';
    } else if (workflowStatus.voiceover && workflowStatus.videos) {
      return 'Continue to Editor';
    } else if (workflowStatus.voiceover) {
      return 'Continue to Upload';
    } else {
      return 'Get Started';
    }
  };

  // Reset workflow and start fresh
  const handleReset = () => {
    if (confirm('Are you sure you want to start a new project? This will clear your current progress.')) {
      localStorage.removeItem('voiceoverUrl');
      localStorage.removeItem('voiceoverScript');
      localStorage.removeItem('uploadedVideos');
      localStorage.removeItem('finalVideoUrl');
      
      setWorkflowStatus({
        voiceover: false,
        videos: false,
        finalVideo: false
      });
    }
  };

  return (
    <div className="relative">
      {/* Subscription Warning Alert */}
      {showSubscriptionWarning && (
        <div className="fixed top-20 left-0 right-0 mx-auto w-full max-w-md z-50 animate-slide-down">
          <div className="bg-gradient-to-r from-yellow-600 to-red-600 text-white p-4 rounded-lg shadow-lg flex items-center justify-between">
            <div className="flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Diese Funktion erfordert ein aktives Abonnement</span>
            </div>
            <button 
              onClick={() => setShowSubscriptionWarning(false)}
              className="text-white hover:text-gray-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Hero Section - Updated to match reference design */}
      <section className="relative overflow-hidden py-12 md:py-20">
        <div className="absolute inset-0 bg-purple-glow opacity-30" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full filter blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/20 rounded-full filter blur-3xl animate-pulse-slow" />
        
        <div className="container relative mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Left Column - Text and CTA */}
            <div className="flex flex-col">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight bg-gradient-to-r from-white via-primary-light/80 to-white bg-clip-text text-transparent">
                AI Video Software für Social Media Content
              </h1>
              
              <p className="mt-6 text-lg text-white/70">
                Erstelle professionelle Werbevideos aus einem Textskript mit deinem eigenen getaggten Videomaterial in wenigen Minuten.
              </p>
              
              {/* Subscription Warning for authenticated users without a plan */}
              {status === 'authenticated' && !hasActiveSubscription && (
                <div className="mt-6 w-full bg-amber-500/20 border border-amber-500/40 p-4 rounded-lg">
                  <div className="flex items-start">
                    <svg className="h-6 w-6 text-amber-500 mr-3 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-white font-medium">Kein aktives Abonnement</p>
                      <p className="text-white/80 text-sm mt-1">
                        Du benötigst ein aktives Abonnement, um Videos zu erstellen. Wähle einen Plan, um alle Funktionen freizuschalten.
                      </p>
                      <Link href="/pricing" className="inline-block mt-2 text-sm text-amber-400 hover:text-amber-300 font-medium">
                        Zu den Abonnements →
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            
              {/* CTA Buttons */}
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Link
                  href={getNextStep()}
                  className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transform hover:scale-105 transition-all duration-300"
                >
                  {getButtonText()}
                  <ArrowRightIcon className="ml-2 h-5 w-5" />
                </Link>
                
                <Link
                  href="/demo"
                  className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl shadow-lg shadow-gray-800/20 hover:shadow-xl hover:shadow-gray-700/30 transform hover:scale-105 transition-all duration-300"
                >
                  Demo Test
                </Link>
              </div>
            
              {/* User Avatars and Social Proof */}
              <div className="mt-10">
                <div className="flex items-center">
                  <div className="flex -space-x-2">
                    {/* Placeholder avatars - replace with actual user avatars if available */}
                    <div className="w-8 h-8 rounded-full bg-primary-light border-2 border-gray-900"></div>
                    <div className="w-8 h-8 rounded-full bg-purple-500 border-2 border-gray-900"></div>
                    <div className="w-8 h-8 rounded-full bg-blue-500 border-2 border-gray-900"></div>
                    <div className="w-8 h-8 rounded-full bg-pink-500 border-2 border-gray-900"></div>
                    <div className="w-8 h-8 rounded-full bg-gray-700 border-2 border-gray-900 flex items-center justify-center text-xs text-white">+</div>
                  </div>
                  <span className="ml-3 text-sm text-white/70">
                    <span className="font-semibold text-white">5,000+</span> zufriedene Nutzer
                  </span>
                </div>
              </div>
              
              {/* Video Grid - Mobile Version */}
              <div className="mt-8 block lg:hidden">
                <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-full mx-auto">
                  {/* Video 1 - Social Media Ad */}
                  <div className="aspect-[9/16] bg-gray-800 rounded-lg overflow-hidden relative group">
                    <Image
                      src="/images/video-placeholder.svg"
                      alt="Social Media Ad Example"
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900/80 pointer-events-none"></div>
                    <div className="absolute bottom-2 left-2 text-xs bg-white/20 backdrop-blur-sm px-1.5 py-0.5 rounded-full">00:15</div>
                    <div className="absolute top-2 right-2 text-xs bg-primary/80 px-1.5 py-0.5 rounded-full">Social</div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-8 h-8 sm:w-12 sm:h-12 text-white" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path>
                      </svg>
                    </div>
                  </div>
                  
                  {/* Video 2 - E-Commerce Ad */}
                  <div className="aspect-[9/16] bg-gray-800 rounded-lg overflow-hidden relative group">
                    <Image
                      src="/images/video-placeholder.svg"
                      alt="E-Commerce Ad Example"
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900/80 pointer-events-none"></div>
                    <div className="absolute bottom-2 left-2 text-xs bg-white/20 backdrop-blur-sm px-1.5 py-0.5 rounded-full">00:30</div>
                    <div className="absolute top-2 right-2 text-xs bg-secondary/80 px-1.5 py-0.5 rounded-full">E-Commerce</div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-8 h-8 sm:w-12 sm:h-12 text-white" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path>
                      </svg>
                    </div>
                  </div>
                  
                  {/* Video 3 - Product Demo */}
                  <div className="aspect-[9/16] bg-gray-800 rounded-lg overflow-hidden relative group">
                    <Image
                      src="/images/video-placeholder.svg"
                      alt="Product Demo Example"
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900/80 pointer-events-none"></div>
                    <div className="absolute bottom-2 left-2 text-xs bg-white/20 backdrop-blur-sm px-1.5 py-0.5 rounded-full">00:20</div>
                    <div className="absolute top-2 right-2 text-xs bg-blue-500/80 px-1.5 py-0.5 rounded-full">Features</div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-8 h-8 sm:w-12 sm:h-12 text-white" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Partner/Client Logos */}
              <div className="mt-10 pt-6 border-t border-white/10">
                <p className="text-sm text-white/50 mb-4">Vertraut von führenden Unternehmen</p>
                <div className="flex flex-wrap gap-6 items-center">
                  {/* Styled logo placeholders with gradients */}
                  <div className="h-8 px-4 py-1 bg-gradient-to-r from-blue-500/20 to-blue-700/20 rounded-md border border-blue-500/30 flex items-center justify-center">
                    <span className="text-blue-300 font-semibold">TechCorp</span>
                  </div>
                  <div className="h-8 px-4 py-1 bg-gradient-to-r from-purple-500/20 to-purple-700/20 rounded-md border border-purple-500/30 flex items-center justify-center">
                    <span className="text-purple-300 font-semibold">MediaPro</span>
                  </div>
                  <div className="h-8 px-4 py-1 bg-gradient-to-r from-green-500/20 to-green-700/20 rounded-md border border-green-500/30 flex items-center justify-center">
                    <span className="text-green-300 font-semibold">EcoSmart</span>
                  </div>
                  <div className="h-8 px-4 py-1 bg-gradient-to-r from-amber-500/20 to-amber-700/20 rounded-md border border-amber-500/30 flex items-center justify-center">
                    <span className="text-amber-300 font-semibold">GoldFinance</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Right Column - Video Grid (Desktop only) */}
            <div className="hidden lg:block">
              <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-full mx-auto">
                {/* Video 1 - Social Media Ad */}
                <div className="aspect-[9/16] bg-gray-800 rounded-lg overflow-hidden relative group">
                  <Image
                    src="/images/video-placeholder.svg"
                    alt="Social Media Ad Example"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900/80 pointer-events-none"></div>
                  <div className="absolute bottom-2 left-2 text-xs bg-white/20 backdrop-blur-sm px-1.5 py-0.5 rounded-full">00:15</div>
                  <div className="absolute top-2 right-2 text-xs bg-primary/80 px-1.5 py-0.5 rounded-full">Social</div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-8 h-8 sm:w-12 sm:h-12 text-white" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path>
                    </svg>
                  </div>
                </div>
                
                {/* Video 2 - E-Commerce Ad */}
                <div className="aspect-[9/16] bg-gray-800 rounded-lg overflow-hidden relative group">
                  <Image
                    src="/images/video-placeholder.svg"
                    alt="E-Commerce Ad Example"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900/80 pointer-events-none"></div>
                  <div className="absolute bottom-2 left-2 text-xs bg-white/20 backdrop-blur-sm px-1.5 py-0.5 rounded-full">00:30</div>
                  <div className="absolute top-2 right-2 text-xs bg-secondary/80 px-1.5 py-0.5 rounded-full">E-Commerce</div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-8 h-8 sm:w-12 sm:h-12 text-white" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path>
                    </svg>
                  </div>
                </div>
                
                {/* Video 3 - Brand Story */}
                <div className="aspect-[9/16] bg-gray-800 rounded-lg overflow-hidden relative group">
                  <Image
                    src="/images/video-placeholder.svg"
                    alt="Brand Story Example"
                    fill
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-900/80 pointer-events-none"></div>
                  <div className="absolute bottom-2 left-2 text-xs bg-white/20 backdrop-blur-sm px-1.5 py-0.5 rounded-full">00:20</div>
                  <div className="absolute top-2 right-2 text-xs bg-blue-500/80 px-1.5 py-0.5 rounded-full">Brand</div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-8 h-8 sm:w-12 sm:h-12 text-white" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"></path>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 glass">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl bg-gradient-to-r from-white to-primary-light bg-clip-text text-transparent">
              So funktioniert's
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
              In vier einfachen Schritten zur fertigen Werbeanzeige mit KI
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300 h-full">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                <UserPlusIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">1. Account erstellen</h3>
              <p className="text-white/70 flex-grow">
                Registriere dich kostenlos, um Zugriff auf Clevercut zu erhalten und einen passenden Plan auszuwählen.
              </p>
            </div>
            
            {/* Step 2 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300 h-full">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                <SpeakerWaveIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">2. Voiceover generieren</h3>
              <p className="text-white/70 flex-grow">
                Wandle dein Skript in ein professionelles Voiceover um – mithilfe fortschrittlicher KI-Technologie.
              </p>
            </div>
            
            {/* Step 3 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300 h-full">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                <div className="relative">
                  <VideoCameraIcon className="h-8 w-8 text-primary" />
                  <TagIcon className="h-4 w-4 text-secondary absolute -right-1 -top-1" />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-3">3. Videos hochladen & taggen</h3>
              <p className="text-white/70 flex-grow">
                Lade deine eigenen Clips hoch und versehe sie mit Keywords für intelligentes Szenen-Matching.
              </p>
            </div>
            
            {/* Step 4 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300 h-full">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                <SparklesIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">4. Finale Ad generieren</h3>
              <p className="text-white/70 flex-grow">
                Clevercut kombiniert dein Skript mit den passenden Szenen und erstellt automatisch eine fertige Ad.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 bg-white/5">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold sm:text-4xl bg-gradient-to-r from-white to-secondary bg-clip-text text-transparent">
              Warum Clevercut?
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
              Entwickelt für Brands und Media Buyer, die Ergebnisse wollen – keine Spielerei.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Benefit 1 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300">
              <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Optimiert für Leads & Sales</h3>
              <p className="text-white/70">
                Unsere Nutzer setzen Clevercut gezielt ein für Conversion-Kampagnen im E-Commerce & B2B.
                Beispielwerte: +23 % ROAS, -40 % CPM durch schnellere Creative Tests.
              </p>
            </div>
            
            {/* Benefit 2 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300">
              <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Endlich das Beste aus vorhandenem Material rausholen</h3>
              <p className="text-white/70">
                Du hast bereits unzählige Clips vom Produkt?
                Clevercut macht daraus in Minuten neue Ad-Variationen – statt stundenlangem Schnitt in Premiere.
              </p>
            </div>
            
            {/* Benefit 3 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300">
              <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Enorme Zeitersparnis</h3>
              <p className="text-white/70">
                Keine Timeline, kein Herumziehen von Clips:
                Script + getaggte Videos = automatisch geschnittenes Creative in Minuten statt Stunden.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-24 bg-gradient-to-b from-background/50 to-background">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl bg-gradient-to-r from-white to-primary bg-clip-text text-transparent">
              Wähle deinen Plan
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
              Finde den perfekten Plan für deine Video-Erstellung
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Starter Plan */}
            <div className="relative rounded-2xl overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-blue-600/20 to-blue-800/40 opacity-70 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10 p-8 flex flex-col h-full glass border border-blue-500/30">
                <div className="px-3 py-1 text-sm text-blue-200 bg-blue-500/30 self-start rounded-full mb-4">
                  Starter
                </div>
                <div className="flex items-end gap-2 mb-6">
                  <span className="text-4xl font-bold">€19</span>
                  <span className="text-white/60 mb-1">/Monat</span>
                </div>
                <p className="text-white/70 mb-8">
                  Perfekt für Einsteiger, die gerade mit Video-Ads beginnen
                </p>
                
                <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-blue-400 mr-2 flex-shrink-0" />
                    <span>10 Videos pro Monat</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-blue-400 mr-2 flex-shrink-0" />
                    <span>150MB maximale Upload-Größe</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-blue-400 mr-2 flex-shrink-0" />
                    <span>2GB Gesamtspeicherplatz</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-blue-400 mr-2 flex-shrink-0" />
                    <span>720p Videoauflösung (SD)</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-blue-400 mr-2 flex-shrink-0" />
                    <span>3 Minuten maximale Videolänge</span>
                  </li>
                </ul>
                
                <Link
                  href="/auth/signup?plan=starter"
                  className="w-full py-3 text-center text-white font-medium bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors"
                >
                  Jetzt starten
                </Link>
              </div>
            </div>
            
            {/* Pro Plan - Featured */}
            <div className="relative rounded-2xl overflow-hidden group transform scale-105 z-10">
              <div className="absolute inset-0 bg-gradient-to-b from-purple-600/30 to-purple-800/50 opacity-80 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-purple-400 to-purple-600"></div>
              <div className="relative z-10 p-8 flex flex-col h-full glass border border-purple-500/40">
                <div className="px-3 py-1 text-sm text-purple-200 bg-purple-500/30 self-start rounded-full mb-4">
                  Pro
                </div>
                <div className="absolute top-8 right-8">
                  <span className="px-3 py-1 text-xs bg-purple-500 text-white rounded-full">Beliebt</span>
                </div>
                <div className="flex items-end gap-2 mb-6">
                  <span className="text-4xl font-bold">€49</span>
                  <span className="text-white/60 mb-1">/Monat</span>
                </div>
                <p className="text-white/70 mb-8">
                  Ideal für Marketer und Content-Ersteller mit regelmäßigem Bedarf
                </p>
                
                <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-purple-400 mr-2 flex-shrink-0" />
                    <span>50 Videos pro Monat</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-purple-400 mr-2 flex-shrink-0" />
                    <span>500MB maximale Upload-Größe</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-purple-400 mr-2 flex-shrink-0" />
                    <span>10GB Gesamtspeicherplatz</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-purple-400 mr-2 flex-shrink-0" />
                    <span>1080p Videoauflösung (HD)</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-purple-400 mr-2 flex-shrink-0" />
                    <span>10 Minuten maximale Videolänge</span>
                  </li>
                </ul>
                
                <Link
                  href="/auth/signup?plan=pro"
                  className="w-full py-3 text-center text-white font-medium bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 rounded-xl transition-all shadow-lg shadow-purple-600/20"
                >
                  Pro wählen
                </Link>
              </div>
            </div>
            
            {/* Business Plan */}
            <div className="relative rounded-2xl overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-b from-amber-600/20 to-amber-800/40 opacity-70 group-hover:opacity-100 transition-opacity duration-300"></div>
              <div className="relative z-10 p-8 flex flex-col h-full glass border border-amber-500/30">
                <div className="px-3 py-1 text-sm text-amber-200 bg-amber-500/30 self-start rounded-full mb-4">
                  Business
                </div>
                <div className="flex items-end gap-2 mb-6">
                  <span className="text-4xl font-bold">€99</span>
                  <span className="text-white/60 mb-1">/Monat</span>
                </div>
                <p className="text-white/70 mb-8">
                  Für professionelle Teams und Unternehmen mit hohem Volumen
                </p>
                
                <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-amber-400 mr-2 flex-shrink-0" />
                    <span>200 Videos pro Monat</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-amber-400 mr-2 flex-shrink-0" />
                    <span>2GB maximale Upload-Größe</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-amber-400 mr-2 flex-shrink-0" />
                    <span>50GB Gesamtspeicherplatz</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-amber-400 mr-2 flex-shrink-0" />
                    <span>4K Videoauflösung (2160p)</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-amber-400 mr-2 flex-shrink-0" />
                    <span>30 Minuten maximale Videolänge</span>
                  </li>
                </ul>
                
                <Link
                  href="/auth/signup?plan=business"
                  className="w-full py-3 text-center text-white font-medium bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors"
                >
                  Business wählen
                </Link>
              </div>
            </div>
          </div>
          
          <div className="mt-12 text-center">
            <p className="text-white/60 max-w-2xl mx-auto">
              Alle Pläne beinhalten Zugang zu unserer KI-gestützten Videoerstellung, Voiceover-Generierung und intelligentem Video-Matching. Benötigst du einen individuellen Plan für dein Unternehmen? 
              <Link href="/contact" className="text-primary ml-1 hover:underline">Kontaktiere uns</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 bg-white/5">
        <div className="container max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold sm:text-4xl bg-gradient-to-r from-white to-primary bg-clip-text text-transparent">
              Noch Fragen?
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
              Alles was du über unseren Service wissen musst
            </p>
          </div>
          
          <div className="space-y-4">
            {/* FAQ Item 1 */}
            <div className="card-gradient rounded-xl overflow-hidden">
              <details className="group">
                <summary className="flex items-center justify-between p-6 cursor-pointer">
                  <h3 className="text-xl font-medium">Wie realistisch sind die KI-Videos?</h3>
                  <span className="transition-transform duration-300 group-open:rotate-180">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </summary>
                <div className="p-6 pt-0 text-white/70">
                  <p>
                    Unsere KI erstellt keine komplett generierten Videos, sondern setzt auf dein eigenes Videomaterial. 
                    Wir kombinieren KI-Technologie zum intelligenten Matching deiner Szenen mit deinem Skript, 
                    wodurch die Videos nicht nur realistisch sind, sondern zu 100% deine eigene Markenidentität widerspiegeln.
                  </p>
                </div>
              </details>
            </div>
            
            {/* FAQ Item 2 */}
            <div className="card-gradient rounded-xl overflow-hidden">
              <details className="group">
                <summary className="flex items-center justify-between p-6 cursor-pointer">
                  <h3 className="text-xl font-medium">Wie lange dauert es, ein Video zu erstellen?</h3>
                  <span className="transition-transform duration-300 group-open:rotate-180">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </summary>
                <div className="p-6 pt-0 text-white/70">
                  <p>
                    Von der Eingabe deines Skripts bis zum fertigen Video dauert es in der Regel nur wenige Minuten.
                    Der genaue Zeitaufwand hängt von der Länge deines Videos und der Komplexität des Skripts ab, 
                    aber selbst komplexere Projekte sind in unter 10 Minuten fertig – ein Bruchteil der Zeit, 
                    die du mit traditioneller Videobearbeitung verbringen würdest.
                  </p>
                </div>
              </details>
            </div>
            
            {/* FAQ Item 3 */}
            <div className="card-gradient rounded-xl overflow-hidden">
              <details className="group">
                <summary className="flex items-center justify-between p-6 cursor-pointer">
                  <h3 className="text-xl font-medium">Wer besitzt die Rechte an den erstellten Videos?</h3>
                  <span className="transition-transform duration-300 group-open:rotate-180">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </summary>
                <div className="p-6 pt-0 text-white/70">
                  <p>
                    Du behältst 100% der Rechte an allen erstellten Videos. Da du dein eigenes Videomaterial 
                    verwendest und wir lediglich die Werkzeuge zum intelligenten Zusammenfügen bereitstellen, 
                    bleiben alle Urheberrechte vollständig bei dir. Du kannst die Videos ohne Einschränkungen 
                    für alle kommerziellen und nicht-kommerziellen Zwecke nutzen.
                  </p>
                </div>
              </details>
            </div>
            
            {/* FAQ Item 4 */}
            <div className="card-gradient rounded-xl overflow-hidden">
              <details className="group">
                <summary className="flex items-center justify-between p-6 cursor-pointer">
                  <h3 className="text-xl font-medium">Was passiert, wenn ich alle meine Video-Generierungen aufgebraucht habe?</h3>
                  <span className="transition-transform duration-300 group-open:rotate-180">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </summary>
                <div className="p-6 pt-0 text-white/70">
                  <p>
                    Wenn du das monatliche Limit an Video-Generierungen in deinem Plan erreicht hast, 
                    hast du drei Möglichkeiten: Warten bis zum nächsten Abrechnungszyklus, ein Upgrade 
                    auf einen höheren Plan durchführen oder zusätzliche Video-Credits erwerben. 
                    Für Teams mit höherem Bedarf bieten wir auch maßgeschneiderte Enterprise-Pläne an.
                  </p>
                </div>
              </details>
            </div>
          </div>
          
          <div className="mt-10 text-center">
            <Link href="/faq" className="text-primary hover:text-primary-light transition-colors">
              Alle FAQs anzeigen →
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container">
          <div className="card-gradient p-10 md:p-16 text-center">
            <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-white to-primary-light bg-clip-text text-transparent">
              Bereit für bessere Ads?
            </h2>
            <p className="text-lg text-white/70 mb-8 max-w-2xl mx-auto">
              Starte jetzt und erstelle hochkonvertierende Werbeanzeigen mit deinem eigenen Videomaterial in Minuten.
            </p>
            <Link
              href={getNextStep()}
              className="inline-flex items-center px-8 py-4 text-lg font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transform hover:scale-105 transition-all duration-300"
            >
              {getButtonText()}
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// Export the default component with Suspense
export default function Home() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-primary">Laden...</div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}
