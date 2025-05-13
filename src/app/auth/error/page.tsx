'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function AuthError() {
  const searchParams = useSearchParams();
  const [errorType, setErrorType] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('Ein Fehler ist bei der Anmeldung aufgetreten.');

  useEffect(() => {
    const error = searchParams.get('error');
    setErrorType(error);

    // Setzt entsprechende Fehlermeldung
    switch (error) {
      case 'missing-token':
        setErrorMessage('Verifikationstoken fehlt. Bitte überprüfe den Link in deiner E-Mail.');
        break;
      case 'invalid-token':
        setErrorMessage('Dein Verifikationstoken ist ungültig oder abgelaufen. Bitte registriere dich erneut.');
        break;
      case 'verification-failed':
        setErrorMessage('Die E-Mail-Verifizierung ist fehlgeschlagen. Bitte versuche es später erneut.');
        break;
      case 'CredentialsSignin':
        setErrorMessage('Ungültige Anmeldedaten. Bitte überprüfe deine E-Mail-Adresse und dein Passwort.');
        break;
      case 'EmailNotVerified':
        setErrorMessage('Deine E-Mail-Adresse wurde noch nicht verifiziert. Bitte überprüfe dein E-Mail-Postfach.');
        break;
      default:
        setErrorMessage('Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.');
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-gray-900 rounded-xl shadow-lg border border-gray-800">
        <div className="text-center">
          <svg 
            className="w-16 h-16 mx-auto text-red-500"
            xmlns="http://www.w3.org/2000/svg" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={1.5} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          
          <h1 className="mt-4 text-2xl font-bold text-white">Authentifizierungsfehler</h1>
          <p className="mt-2 text-red-400">{errorMessage}</p>
        </div>

        <div className="mt-8 flex flex-col gap-4">
          <Link 
            href="/auth/signin"
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
          >
            Zurück zur Anmeldung
          </Link>
          
          {errorType === 'invalid-token' && (
            <Link 
              href="/auth/signup"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-white bg-gray-600 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
            >
              Erneut registrieren
            </Link>
          )}
          
          {errorType === 'EmailNotVerified' && (
            <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 text-sm">
              <p>Eine Bestätigungs-E-Mail wurde an deine E-Mail-Adresse gesendet. Bitte klicke auf den Link in der E-Mail, um dein Konto zu verifizieren.</p>
              <p className="mt-2">Wenn du keine E-Mail erhalten hast, überprüfe bitte deinen Spam-Ordner oder registriere dich erneut.</p>
            </div>
          )}
          
          <Link 
            href="/"
            className="text-center text-gray-400 hover:text-white transition-colors"
          >
            Zurück zur Startseite
          </Link>
        </div>
      </div>
    </div>
  );
} 