'use client'

import React, { useEffect, useState } from 'react'
import { ArrowRightIcon, CheckCircleIcon, SparklesIcon, VideoCameraIcon, SpeakerWaveIcon, TagIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

type WorkflowStatus = {
  voiceover: boolean;
  videos: boolean;
  finalVideo: boolean;
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>({
    voiceover: false,
    videos: false,
    finalVideo: false
  });

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
      return 'Create Free Account';
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
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20">
        <div className="absolute inset-0 bg-purple-glow opacity-30" />
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/20 rounded-full filter blur-3xl animate-pulse-slow" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-secondary/20 rounded-full filter blur-3xl animate-pulse-slow" />
        
        <div className="container relative pt-10 pb-20 md:pt-20 md:pb-32">
          <div className="flex flex-col items-center text-center">
            <div className="inline-flex items-center px-4 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 mb-8">
              <SparklesIcon className="h-5 w-5 text-primary mr-2" />
              <span className="text-sm font-medium">AI-Powered Marketing Videos</span>
            </div>
            
            <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-6xl md:text-7xl bg-gradient-to-r from-white via-primary-light/80 to-white bg-clip-text text-transparent animate-float">
              Generate High-Converting Ad Videos in Minutes
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-white/70">
              The ultimate SaaS tool for performance marketers and media buyers. Create professional ad videos from a text script using your own tagged video footage.
            </p>
            
            {/* Progress Indicator for logged in users */}
            {status === 'authenticated' && (workflowStatus.voiceover || workflowStatus.videos || workflowStatus.finalVideo) && (
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
            
            {/* Sign up/Log in options for non-authenticated users */}
            {status !== 'authenticated' && (
              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <Link
                  href="/auth/signup"
                  className="inline-flex items-center px-8 py-4 text-lg font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transform hover:scale-105 transition-all duration-300"
                >
                  Create Free Account
                  <ArrowRightIcon className="ml-2 h-5 w-5" />
                </Link>
                <Link
                  href="/auth/signin"
                  className="inline-flex items-center px-8 py-4 text-lg font-medium text-white bg-gray-800 hover:bg-gray-700 rounded-xl shadow-lg shadow-gray-800/20 hover:shadow-xl hover:shadow-gray-700/30 transform hover:scale-105 transition-all duration-300"
                >
                  Sign In
                </Link>
              </div>
            )}
            
            {/* CTA button for authenticated users */}
            {status === 'authenticated' && (
              <div className="mt-10">
                <Link
                  href={getNextStep()}
                  className="inline-flex items-center px-8 py-4 text-lg font-medium text-white bg-gradient-to-r from-primary to-primary-light rounded-xl shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 transform hover:scale-105 transition-all duration-300"
                >
                  {getButtonText()}
                  <ArrowRightIcon className="ml-2 h-5 w-5" />
                </Link>
              </div>
            )}
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
              Create professional ad videos in four simple steps
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300 h-full">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                <UserPlusIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Create Account</h3>
              <p className="text-white/70 flex-grow">
                Sign up for your free account to get access to all features.
              </p>
              <Link href="/auth/signup" className="mt-6 text-primary hover:text-primary-light transition-colors">
                Sign Up →
              </Link>
            </div>
            
            {/* Step 2 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300 h-full">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                <SpeakerWaveIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Create Voiceover</h3>
              <p className="text-white/70 flex-grow">
                Generate a professional voiceover from your script using advanced AI technology.
              </p>
              <Link href="/auth/signin" className="mt-6 text-primary hover:text-primary-light transition-colors">
                Start with Voiceover →
              </Link>
            </div>
            
            {/* Step 3 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300 h-full">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                <div className="relative">
                  <VideoCameraIcon className="h-8 w-8 text-primary" />
                  <TagIcon className="h-4 w-4 text-secondary absolute -right-1 -top-1" />
                </div>
              </div>
              <h3 className="text-xl font-bold mb-3">Upload & Tag Videos</h3>
              <p className="text-white/70 flex-grow">
                Upload your video clips and tag them with relevant keywords for intelligent matching.
              </p>
              <Link href="/auth/signin" className="mt-6 text-primary hover:text-primary-light transition-colors">
                Upload Videos →
              </Link>
            </div>
            
            {/* Step 4 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300 h-full">
              <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                <SparklesIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3">Generate Final Ad</h3>
              <p className="text-white/70 flex-grow">
                Our AI automatically matches your script with the perfect video clips to create your final ad.
              </p>
              <Link href="/auth/signin" className="mt-6 text-primary hover:text-primary-light transition-colors">
                Go to Editor →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 bg-white/5">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold sm:text-4xl bg-gradient-to-r from-white to-secondary bg-clip-text text-transparent">
              Why Choose Our Platform
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
              Create high-converting ads faster and more effectively than ever
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Benefit 1 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300">
              <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Save Time</h3>
              <p className="text-white/70">
                Generate high-quality ad videos in minutes, not hours. Our AI matches your script with the perfect video segments automatically.
              </p>
            </div>
            
            {/* Benefit 2 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300">
              <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Use Your Own Footage</h3>
              <p className="text-white/70">
                Unlike other solutions that use generic stock videos, our platform lets you use your own branded footage with intelligent tagging.
              </p>
            </div>
            
            {/* Benefit 3 */}
            <div className="card-gradient p-8 flex flex-col items-center text-center transform hover:scale-105 transition-transform duration-300">
              <div className="w-16 h-16 rounded-full bg-secondary/20 flex items-center justify-center mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Higher Conversion Rates</h3>
              <p className="text-white/70">
                Create ads that convert better by perfectly matching your message with relevant visuals through our intelligent tagging system.
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
              Choose Your Plan
            </h2>
            <p className="mt-4 text-lg text-white/70 max-w-2xl mx-auto">
              Find the perfect plan for your video creation needs
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
                  <span className="text-white/60 mb-1">/month</span>
                </div>
                <p className="text-white/70 mb-8">
                  Perfect for individuals just getting started with video ads
                </p>
                
                <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-blue-400 mr-2 flex-shrink-0" />
                    <span>10 videos per month</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-blue-400 mr-2 flex-shrink-0" />
                    <span>150MB max upload size</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-blue-400 mr-2 flex-shrink-0" />
                    <span>2GB total storage space</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-blue-400 mr-2 flex-shrink-0" />
                    <span>720p video resolution (SD)</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-blue-400 mr-2 flex-shrink-0" />
                    <span>3 minutes max video length</span>
                  </li>
                </ul>
                
                <Link
                  href="/auth/signup?plan=starter"
                  className="w-full py-3 text-center text-white font-medium bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors"
                >
                  Get Started
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
                  <span className="px-3 py-1 text-xs bg-purple-500 text-white rounded-full">Popular</span>
                </div>
                <div className="flex items-end gap-2 mb-6">
                  <span className="text-4xl font-bold">€49</span>
                  <span className="text-white/60 mb-1">/month</span>
                </div>
                <p className="text-white/70 mb-8">
                  Ideal for marketers and content creators with regular needs
                </p>
                
                <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-purple-400 mr-2 flex-shrink-0" />
                    <span>50 videos per month</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-purple-400 mr-2 flex-shrink-0" />
                    <span>500MB max upload size</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-purple-400 mr-2 flex-shrink-0" />
                    <span>10GB total storage space</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-purple-400 mr-2 flex-shrink-0" />
                    <span>1080p video resolution (HD)</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-purple-400 mr-2 flex-shrink-0" />
                    <span>10 minutes max video length</span>
                  </li>
                </ul>
                
                <Link
                  href="/auth/signup?plan=pro"
                  className="w-full py-3 text-center text-white font-medium bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 rounded-xl transition-all shadow-lg shadow-purple-600/20"
                >
                  Choose Pro
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
                  <span className="text-white/60 mb-1">/month</span>
                </div>
                <p className="text-white/70 mb-8">
                  For professional teams and businesses with high volume needs
                </p>
                
                <ul className="space-y-4 mb-8 flex-grow">
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-amber-400 mr-2 flex-shrink-0" />
                    <span>200 videos per month</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-amber-400 mr-2 flex-shrink-0" />
                    <span>2GB max upload size</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-amber-400 mr-2 flex-shrink-0" />
                    <span>50GB total storage space</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-amber-400 mr-2 flex-shrink-0" />
                    <span>4K video resolution (2160p)</span>
                  </li>
                  <li className="flex">
                    <CheckCircleIcon className="h-6 w-6 text-amber-400 mr-2 flex-shrink-0" />
                    <span>30 minutes max video length</span>
                  </li>
                </ul>
                
                <Link
                  href="/auth/signup?plan=business"
                  className="w-full py-3 text-center text-white font-medium bg-amber-600 hover:bg-amber-500 rounded-xl transition-colors"
                >
                  Choose Business
                </Link>
              </div>
            </div>
          </div>
          
          <div className="mt-12 text-center">
            <p className="text-white/60 max-w-2xl mx-auto">
              All plans include access to our AI-powered video generation, voiceover creation, and intelligent video matching. Need a custom plan for your enterprise? 
              <Link href="/contact" className="text-primary ml-1 hover:underline">Contact us</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container">
          <div className="card-gradient p-10 md:p-16 text-center">
            <h2 className="text-3xl font-bold mb-6 bg-gradient-to-r from-white to-primary-light bg-clip-text text-transparent">
              Ready to Create Better Ads?
            </h2>
            <p className="text-lg text-white/70 mb-8 max-w-2xl mx-auto">
              Join now and start creating high-converting ad videos with your own footage in minutes.
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
