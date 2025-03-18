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
    <div className="min-h-screen bg-[#0C0D1E]">
      {/* Main content */}
      <div className="max-w-7xl mx-auto p-4 md:p-6 pt-8">
        <ScriptVideoMatcher />
      </div>
    </div>
  );
} 