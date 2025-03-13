'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { errorMessages } from './errorMessages';

export default function ErrorContent() {
  const searchParams = useSearchParams();
  const [errorType, setErrorType] = useState<string>('default');
  const [errorDescription, setErrorDescription] = useState<string>('');

  useEffect(() => {
    // Extrahiere Fehlercodes aus der URL
    const error = searchParams?.get('error') || 'default';
    setErrorType(error);
    setErrorDescription(errorMessages[error] || errorMessages.default);
  }, [searchParams]);

  return (
    <div className="text-center">
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-16 w-16 text-red-500 mx-auto" 
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
      
      <h1 className="mt-4 text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-red-600">
        Authentifizierungsfehler
      </h1>
      
      <p className="mt-2 text-gray-400">
        {errorDescription}
      </p>
    </div>
  );
} 