'use client'

import React, { useEffect, useState } from 'react'
import { ArrowRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
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
    <main className="relative">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial from-primary/20 via-background to-background" />
        <div className="container relative pt-20 pb-24 md:pt-32 md:pb-44">
          <div className="flex flex-col items-center text-center">
            <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl md:text-7xl bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
              Create High-Converting Ad Videos with AI
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white/60">
              Transform your ideas into engaging ads. Start with a voiceover, then match it with your perfect video clips.
            </p>
            
            {/* Progress Indicator */}
            {(workflowStatus.voiceover || workflowStatus.videos || workflowStatus.finalVideo) && (
              <div className="mt-8 w-full max-w-md">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-white/60">Your Progress</span>
                  <button 
                    onClick={handleReset}
                    className="text-sm text-primary-light hover:text-primary"
                  >
                    Start New
                  </button>
                </div>
                <div className="bg-white/10 rounded-full h-2 mb-4">
                  <div 
                    className="bg-gradient-to-r from-primary to-primary-light h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${
                        (workflowStatus.voiceover ? 33 : 0) + 
                        (workflowStatus.videos ? 33 : 0) + 
                        (workflowStatus.finalVideo ? 34 : 0)
                      }%` 
                    }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-white/40">
                  <div className={`flex items-center ${workflowStatus.voiceover ? 'text-primary' : ''}`}>
                    {workflowStatus.voiceover && <CheckCircleIcon className="h-4 w-4 mr-1" />}
                    Voiceover
                  </div>
                  <div className={`flex items-center ${workflowStatus.videos ? 'text-primary' : ''}`}>
                    {workflowStatus.videos && <CheckCircleIcon className="h-4 w-4 mr-1" />}
                    Videos
                  </div>
                  <div className={`flex items-center ${workflowStatus.finalVideo ? 'text-primary' : ''}`}>
                    {workflowStatus.finalVideo && <CheckCircleIcon className="h-4 w-4 mr-1" />}
                    Final Ad
                  </div>
                </div>
              </div>
            )}
            
            <div className="mt-10">
              <Link
                href={getNextStep()}
                className="inline-flex items-center px-6 py-3 text-lg font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-lg hover:opacity-90 transition-opacity"
              >
                {getButtonText()}
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-background-light/50 backdrop-blur-xl">
        <div className="container">
          <div className="text-center">
            <h2 className="text-3xl font-bold sm:text-4xl bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
              How It Works
            </h2>
            <p className="mt-4 text-lg text-white/60">
              Create professional ad videos in three simple steps
            </p>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {[
              {
                title: 'Create Voiceover',
                description: 'Generate professional AI voiceover from your script',
                number: '1',
                completed: workflowStatus.voiceover,
                link: '/voiceover'
              },
              {
                title: 'Upload Videos',
                description: 'Upload your video clips to your personal library',
                number: '2',
                completed: workflowStatus.videos,
                link: '/upload'
              },
              {
                title: 'Generate',
                description: 'Let AI create your ad using your voiceover and clips',
                number: '3',
                completed: workflowStatus.finalVideo,
                link: '/editor'
              },
            ].map((feature, index) => (
              <Link
                key={index}
                href={feature.link}
                className="relative group rounded-2xl border border-white/10 bg-background-light/50 p-6 backdrop-blur-xl hover:border-primary/50 transition-colors"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent rounded-2xl" />
                <div className="relative">
                  <div className={`w-12 h-12 rounded-full ${
                    feature.completed 
                      ? 'bg-primary/20 border border-primary text-primary' 
                      : 'bg-gradient-to-r from-primary to-primary-light text-white'
                    } flex items-center justify-center text-xl font-bold`}
                  >
                    {feature.completed ? <CheckCircleIcon className="h-6 w-6" /> : feature.number}
                  </div>
                  <h3 className="mt-4 text-xl font-semibold text-white">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-white/60">
                    {feature.description}
                  </p>
                  {feature.completed && (
                    <div className="mt-4 text-sm text-primary">
                      Completed • Click to edit
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary-light/20" />
        <div className="container relative">
          <div className="text-center">
            <h2 className="text-3xl font-bold sm:text-4xl bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent">
              {workflowStatus.finalVideo 
                ? 'Your ad is ready! Want to create another?' 
                : 'Ready to create your first AI-powered ad?'}
            </h2>
            <p className="mt-4 text-lg text-white/60">
              {workflowStatus.finalVideo 
                ? 'Start a new project or continue editing your current ad.'
                : 'Start by creating your voiceover and see the magic happen.'}
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <Link
                href={getNextStep()}
                className="inline-flex items-center px-6 py-3 text-lg font-medium text-primary-light bg-white/10 rounded-lg border border-primary-light/30 hover:bg-white/20 transition-colors"
              >
                {getButtonText()}
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Link>
              
              {workflowStatus.finalVideo && (
                <button
                  onClick={handleReset}
                  className="inline-flex items-center px-6 py-3 text-lg font-medium text-white/70 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
                >
                  Start New Project
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
