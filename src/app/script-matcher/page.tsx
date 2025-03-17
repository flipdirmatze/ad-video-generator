import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ScriptVideoMatcher from '@/components/ScriptVideoMatcher';

export default async function ScriptMatcherPage() {
  // Authentifizierung prüfen
  const session = await getServerSession(authOptions);
  
  // Wenn nicht eingeloggt, zur Login-Seite umleiten
  if (!session?.user) {
    redirect('/auth/signin?callbackUrl=/script-matcher');
  }
  
  return (
    <div className="min-h-screen bg-base-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-secondary text-white p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold">KI-Video-Matching</h1>
          <p className="mt-2 opacity-80">Finde passende Videos für dein Voiceover</p>
        </div>
      </div>
      
      {/* Main content */}
      <div className="max-w-7xl mx-auto p-4 mt-4">
        <div className="card-gradient p-6 rounded-xl">
          <ScriptVideoMatcher />
        </div>
      </div>
    </div>
  );
} 