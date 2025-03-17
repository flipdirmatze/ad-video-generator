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
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-8">KI-Video-Matching</h1>
      
      <div className="bg-white rounded-lg shadow-md p-6">
        <ScriptVideoMatcher />
      </div>
    </div>
  );
} 