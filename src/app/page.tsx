'use client'

import React, { useEffect, useState } from 'react'
import { ArrowRightIcon, CheckCircleIcon, SparklesIcon, VideoCameraIcon, SpeakerWaveIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'

type WorkflowStatus = {
  voiceover: boolean;
  videos: boolean;
  finalVideo: boolean;
}

export default function Home() {
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>({
    voiceover: false,
    videos: false,
    finalVideo: false
  });

  // Check localStorage for workflow progress
  useEffect(() => {
    const hasVoiceover = !!localStorage.getItem('voiceoverUrl');
    const hasVideos = !!localStorage.getItem('uploadedVideos');
    const hasFinalVideo = !!localStorage.getItem('finalVideoUrl');

    setWorkflowStatus({
      voiceover: hasVoiceover,
      videos: hasVideos,
      finalVideo: hasFinalVideo
    });
  }, []);

  // Determine the next step in the workflow
  const getNextStep = () => {
    if (!workflowStatus.voiceover) {
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
    if (workflowStatus.finalVideo) {
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
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20">
        <div className="absolute inset-0 bg-purple-glow opacity-30" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full filter blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/20 rounded-full filter blur-3xl animate-pulse-slow" />
        
        <div className="container relative pt-10 pb-20 md:pt-20 md:pb-32">
          <div className="flex flex-col items-center text-center">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 mb-8">
              <SparklesIcon className="h-5 w-5 text-primary mr-2" />
              <span className="text-sm font-medium">AI-Powered Video Generation</span>
            </div>
            
            <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl md:text-7xl bg-gradient-to-r from-white via-primary-light/80 to-white bg-clip-text text-transparent animate-float">
              Create High-Converting Ad Videos with AI
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white/70">
              Transform your ideas into engaging ads. Start with a voiceover, then match it with your perfect video clips.
            </p>
            
            {/* Progress Indicator */}
            {(workflowStatus.voiceover || workflowStatus.videos || workflowStatus.finalVideo) && (
              <div className="mt-10 w-full max-w-md glass p-6 rounded-xl">
                <div className="flex justify-between mb-3">
                  <span className="text-sm font-medium text-white/80">Your Progress</span>
                  <button 
                    onClick={handleReset}
                    className="text-sm text-primary-light hover:text-primary transition-colors"
                  >
                    Start New
                  </button>
                </div>
                <div className="bg-white/10 rounded-full h-3 mb-5">
                  <div 
                    className="bg-gradient-to-r from-primary to-primary-light h-3 rounded-full transition-all duration-500 animate-glow"
                    style={{ 
                      width: `${
                        (workflowStatus.voiceover ? 33 : 0) + 
                        (workflowStatus.videos ? 33 : 0) + 
                        (workflowStatus.finalVideo ? 34 : 0)
                      }%` 
                    }}
                  ></div>
                </div>
                <div className="flex justify-between text-sm">
                  <div className={`flex items-center ${workflowStatus.voiceover ? 'text-primary' : 'text-white/50'}`}>
                    {workflowStatus.voiceover ? 
                      <CheckCircleIcon className="h-5 w-5 mr-2" /> : 
                      <SpeakerWaveIcon className="h-5 w-5 mr-2" />
                    }
                    Voiceover
                  </div>
                  <div className={`flex items-center ${workflowStatus.videos ? 'text-primary' : 'text-white/50'}`}>
                    {workflowStatus.videos ? 
                      <CheckCircleIcon className="h-5 w-5 mr-2" /> : 
                      <VideoCameraIcon className="h-5 w-5 mr-2" />
                    }
                    Videos
                  </div>
                  <div className={`flex items-center ${workflowStatus.finalVideo ? 'text-primary' : 'text-white/50'}`}>
                    {workflowStatus.finalVideo ? 
                      <CheckCircleIcon className="h-5 w-5 mr-2" /> : 
                      <SparklesIcon className="h-5 w-5 mr-2" />
                    }
                    Final Ad
                  </div>
                </div>
              </div>
            )}
            
            <div className="mt-10">
              <Link
                href={getNextStep()}
                className="inline-flex items-center px-8 py-4 text-lg font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transform hover:scale-105 transition-all duration-300"
              >
                {getButtonText()}
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 glass">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold sm:text-4xl bg-gradient-to-r from-white to-primary-light bg-clip-text text-transparent">
              How It Works
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
              Create professional ad videos in three simple steps
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                <SpeakerWaveIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Create Voiceover</h3>
              <p className="text-white/70">
                Generate a professional voiceover from your script using advanced AI technology.
              </p>
              <Link href="/voiceover" className="mt-6 text-primary hover:text-primary-light transition-colors">
                Start with Voiceover →
              </Link>
            </div>
            
            {/* Step 2 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                <VideoCameraIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Upload Videos</h3>
              <p className="text-white/70">
                Upload your video clips that will be combined with the voiceover.
              </p>
              <Link href="/upload" className="mt-6 text-primary hover:text-primary-light transition-colors">
                Upload Videos →
              </Link>
            </div>
            
            {/* Step 3 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                <SparklesIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Generate Final Ad</h3>
              <p className="text-white/70">
                Combine your voiceover with selected video clips to create your final ad.
              </p>
              <Link href="/editor" className="mt-6 text-primary hover:text-primary-light transition-colors">
                Go to Editor →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Advanced Tools Section */}
      <section className="py-16 bg-white/5">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold sm:text-4xl bg-gradient-to-r from-white to-secondary bg-clip-text text-transparent">
              Advanced Tools
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
              Additional utilities to enhance your video creation workflow
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Concat Tool */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300">
              <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Video Concatenation</h3>
              <p className="text-white/70 mb-6">
                Simply combine multiple videos without re-encoding, preserving original quality.
              </p>
              <Link href="/concat" className="mt-auto inline-flex items-center px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-secondary to-secondary-light rounded-xl shadow-lg shadow-secondary/20 hover:shadow-xl hover:shadow-secondary/30 transition-all duration-300">
                Combine Videos
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </Link>
            </div>
            
            {/* Server-side Concat Test */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300">
              <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Server-side Test</h3>
              <p className="text-white/70 mb-6">
                Test video concatenation with existing videos already on the server.
              </p>
              <Link href="/test-concat" className="mt-auto inline-flex items-center px-6 py-3 text-sm font-medium text-white bg-gradient-to-r from-secondary to-secondary-light rounded-xl shadow-lg shadow-secondary/20 hover:shadow-xl hover:shadow-secondary/30 transition-all duration-300">
                Test Concat
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </Link>
            </div>
            
            {/* Placeholder for future tools */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300 opacity-60">
              <div className="w-16 h-16 rounded-full bg-gray-500/20 flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">More Tools Coming Soon</h3>
              <p className="text-white/70 mb-6">
                Stay tuned for additional video processing and editing tools.
              </p>
              <button disabled className="mt-auto inline-flex items-center px-6 py-3 text-sm font-medium text-white bg-gray-500/50 rounded-xl cursor-not-allowed">
                Coming Soon
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container">
          <div className="card-gradient p-10 md:p-16 text-center">
            <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-white to-primary-light bg-clip-text text-transparent">
              Ready to Create Your Ad?
            </h2>
            <p className="text-lg text-white/70 mb-8 max-w-2xl mx-auto">
              Start with a voiceover, add your videos, and generate a professional ad in minutes.
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
