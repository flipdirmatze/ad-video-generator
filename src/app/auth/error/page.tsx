'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import ErrorContent from './ErrorContent';

export default function AuthErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-gray-900 rounded-xl shadow-lg border border-gray-800">
        <Suspense fallback={<LoadingErrorContent />}>
          <ErrorContent />
        </Suspense>

        <div className="mt-8 space-y-4">
          <Link 
            href="/auth/signin" 
            className="block w-full py-3 px-4 border border-transparent rounded-lg text-center text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
          >
            Zurück zur Anmeldeseite
          </Link>
          
          <Link 
            href="/" 
            className="block w-full py-3 px-4 border border-gray-700 rounded-lg text-center text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
          >
            Zurück zur Startseite
          </Link>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            Brauchst du Hilfe? {' '}
            <Link href="/contact" className="text-purple-500 hover:underline">
              Kontaktiere uns
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function LoadingErrorContent() {
  return (
    <div className="text-center">
      <div className="h-16 w-16 text-red-500 mx-auto animate-pulse bg-red-500/20 rounded-full flex items-center justify-center">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="h-8 w-8" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
          />
        </svg>
      </div>
      
      <h1 className="mt-4 text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-red-600">
        Authentifizierungsfehler
      </h1>
      
      <p className="mt-2 text-gray-400">
        Fehlerinformationen werden geladen...
      </p>
    </div>
  )
} 