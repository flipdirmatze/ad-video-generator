'use client';

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export default function SigninContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const verified = searchParams.get('verified');
    if (verified === '1') {
      setSuccess('E-Mail-Adresse erfolgreich verifiziert! Du kannst dich jetzt anmelden. Nach der Anmeldung wirst du aufgefordert, einen Abonnement-Plan auszuwählen, um den vollen Funktionsumfang von CleverCut nutzen zu können.');
    }
    
    const errorParam = searchParams.get('error');
    if (errorParam) {
      switch (errorParam) {
        case 'CredentialsSignin':
          setError('Ungültige Anmeldedaten. Bitte überprüfe deine E-Mail-Adresse und dein Passwort.');
          break;
        case 'EmailNotVerified':
          setError('Deine E-Mail-Adresse wurde noch nicht verifiziert. Bitte überprüfe dein E-Mail-Postfach.');
          break;
        default:
          setError('Ein Fehler ist aufgetreten. Bitte versuche es erneut.');
      }
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        if (result.error === 'CredentialsSignin') {
          setError('Ungültige Anmeldedaten. Bitte überprüfe deine E-Mail-Adresse und dein Passwort.');
        } else if (result.error === 'EmailNotVerified') {
          setError('Deine E-Mail-Adresse wurde noch nicht verifiziert. Bitte überprüfe dein E-Mail-Postfach.');
        } else {
          setError(result.error);
        }
        setIsLoading(false);
        return;
      }

      router.push('/pricing');
      router.refresh();
    } catch (err) {
      console.error('Sign in error:', err);
      setError('Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.');
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    signIn('google', { callbackUrl: '/pricing' });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 space-y-8 bg-gray-900 rounded-xl shadow-lg border border-gray-800">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-purple-600">
            Anmelden
          </h1>
          <p className="mt-2 text-gray-400">Melde dich bei deinem CleverCut-Konto an</p>
        </div>

        {success && (
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-500 text-sm">
            {success}
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
            {error}
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300">
              E-Mail-Adresse
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Gib deine E-Mail-Adresse ein"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300">
              Passwort
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Gib dein Passwort ein"
            />
          </div>

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Anmeldung läuft...' : 'Anmelden'}
            </button>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-900 text-gray-400">Oder fortfahren mit</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex justify-center items-center gap-3 py-3 px-4 border border-gray-700 rounded-lg shadow-sm text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.501 12.236C22.501 11.478 22.4296 10.7191 22.2868 9.97921H12.2153V14.1676H18.0189C17.775 15.5501 17.0273 16.7458 15.8996 17.5529V20.3259H19.4193C21.4558 18.4314 22.501 15.6003 22.501 12.236Z" fill="#4285F4" />
                <path d="M12.214 23.0008C15.1068 23.0008 17.5353 22.0077 19.4181 20.3258L15.8984 17.5528C14.9621 18.1922 13.7191 18.5577 12.214 18.5577C9.38072 18.5577 6.97216 16.6586 6.11907 14.0869H2.49609V16.9407C4.36784 20.5 8.04053 23.0008 12.214 23.0008Z" fill="#34A853" />
                <path d="M6.12012 14.0868C5.91512 13.4475 5.79988 12.7653 5.79988 12.0653C5.79988 11.3654 5.91512 10.6831 6.12012 10.0438V7.19006H2.4971C1.8404 8.6636 1.47754 10.3137 1.47754 12.0653C1.47754 13.8169 1.8404 15.467 2.4971 16.9406L6.12012 14.0868Z" fill="#FBBC05" />
                <path d="M12.214 5.57265C13.7548 5.57265 15.1333 6.15265 16.2047 7.16996L19.3595 4.01511C17.529 2.30249 15.1005 1.13037 12.214 1.13037C8.04051 1.13037 4.36782 3.63116 2.49609 7.19052L6.12011 10.0443C6.9732 7.47265 9.38176 5.57265 12.214 5.57265Z" fill="#EA4335" />
              </svg>
              Mit Google anmelden
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            Noch kein Konto?{' '}
            <Link href="/auth/signup" className="text-purple-500 hover:underline">
              Registrieren
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
} 