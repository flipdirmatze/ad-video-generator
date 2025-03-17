import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { analyzeScript } from '@/lib/openai';

export async function POST(request: NextRequest) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Skript aus dem Request-Body extrahieren
    const { script } = await request.json();
    
    if (!script) {
      return NextResponse.json({ error: 'Script is required' }, { status: 400 });
    }

    console.log(`Analysiere Skript für Benutzer ${session.user.id}...`);

    // Skript analysieren
    const segments = await analyzeScript(script);
    
    console.log(`Skriptanalyse abgeschlossen. ${segments.length} Segmente gefunden.`);
    
    return NextResponse.json({
      success: true,
      segments
    });
  } catch (error) {
    console.error('Error analyzing script:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze script', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 