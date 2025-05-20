import { NextResponse, NextRequest } from 'next/server';
import { RateLimiter } from 'limiter';

// Definiere Interval-Typ für die RateLimiter-Optionen
type Interval = 'second' | 'minute' | 'hour' | 'day';

// In-Memory Store für Rate Limiters
// In einer Produktionsumgebung würde man Redis oder einen anderen verteilten Cache verwenden
const limiters: Record<string, RateLimiter> = {};

// Verschiedene Limiter-Konfigurationen nach Routentyp
const limiterConfigs = {
  // Auth-Routen (Login, Registrierung, etc.)
  auth: {
    tokensPerInterval: 5,   // 5 Anfragen
    interval: 'minute' as Interval,  // pro Minute
    fireImmediately: true,
  },
  // API-Routen für Kernfunktionen
  api: {
    tokensPerInterval: 30,  // 30 Anfragen
    interval: 'minute' as Interval,  // pro Minute
    fireImmediately: true,
  },
  // Voiceover-Generation und andere ressourcenintensive Operationen
  heavy: {
    tokensPerInterval: 10,  // 10 Anfragen
    interval: 'minute' as Interval,  // pro Minute
    fireImmediately: true,
  },
  // Standard-Limit für alle anderen Routen
  default: {
    tokensPerInterval: 60,  // 60 Anfragen
    interval: 'minute' as Interval,  // pro Minute
    fireImmediately: true,
  }
};

/**
 * Ermittelt den Limiter-Typ basierend auf dem Pfad
 */
function getLimiterType(path: string): keyof typeof limiterConfigs {
  // Auth-Routen
  if (path.startsWith('/api/auth') || path === '/auth/signin' || path === '/auth/signup') {
    return 'auth';
  }
  
  // Ressourcenintensive Operationen
  if (
    path.startsWith('/api/generate-voiceover') ||
    path.startsWith('/api/video-workflow') ||
    path.startsWith('/api/generate-video')
  ) {
    return 'heavy';
  }
  
  // Alle anderen API-Routen
  if (path.startsWith('/api/')) {
    return 'api';
  }
  
  // Standard für alle anderen Pfade
  return 'default';
}

/**
 * Erstellt einen Schlüssel für den Limiter basierend auf IP und Pfad
 */
function getLimiterKey(ip: string, path: string): string {
  const type = getLimiterType(path);
  return `${ip}:${type}`;
}

/**
 * Initialisiert oder holt einen existierenden Limiter
 */
function getLimiter(ip: string, path: string): RateLimiter {
  const key = getLimiterKey(ip, path);
  const type = getLimiterType(path);
  
  if (!limiters[key]) {
    limiters[key] = new RateLimiter(limiterConfigs[type]);
  }
  
  return limiters[key];
}

/**
 * Rate Limiter Middleware-Funktion
 * 
 * @param request Der eingehende Request
 */
export async function rateLimiter(request: NextRequest) {
  // Pfad der Anfrage
  const path = request.nextUrl.pathname;
  
  // IP-Adresse des Clients
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
  
  // Öffentliche Routen mit niedrigem Risiko überspringen
  if (
    path === '/' || 
    path.startsWith('/_next/') || 
    path.startsWith('/static/') ||
    path.startsWith('/api/health') ||
    path.endsWith('.ico') ||
    path.endsWith('.svg') ||
    path.endsWith('.png') ||
    path.endsWith('.jpg') ||
    path.endsWith('.jpeg')
  ) {
    return null;
  }
  
  // Limiter für den Client und Pfad holen
  const limiter = getLimiter(ip, path);
  
  // Prüfen, ob der Client das Limit überschritten hat
  const result = await limiter.removeTokens(1);
  
  // Wenn der Client das Limit überschritten hat
  if (result < 0) {
    console.warn(`Rate limit exceeded for ${ip} on ${path}`);
    
    // 429 Too Many Requests
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': '60' } }
    );
  }
  
  // Anfrage zulassen
  return null;
}

/**
 * Bereinigt alte Limiter aus dem Speicher (aufzurufen in regelmäßigen Intervallen)
 * In einer Produktionsumgebung würde man dies durch TTL in Redis oder einem anderen Cache lösen
 */
export function cleanupLimiters() {
  const now = Date.now();
  
  // Einträge älter als 2 Stunden entfernen
  Object.keys(limiters).forEach(key => {
    const limiter = limiters[key];
    // @ts-expect-error - Zugriff auf interne Eigenschaften für Cleanup
    const lastCheck = limiter.lastChecked || 0;
    
    if (now - lastCheck > 2 * 60 * 60 * 1000) {
      delete limiters[key];
    }
  });
}

// Regelmäßige Bereinigung starten (alle 30 Minuten)
// In einer Serverless-Umgebung würde man dies anders implementieren
if (typeof window === 'undefined') {
  setInterval(cleanupLimiters, 30 * 60 * 1000);
} 