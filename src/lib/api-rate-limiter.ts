import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter } from 'limiter';

// In-Memory Store für API Rate Limiters
const apiLimiters: Record<string, RateLimiter> = {};

// Verschiedene API Limiter-Konfigurationen nach Endpunkt-Typ
type LimiterConfig = {
  tokensPerInterval: number;
  interval: 'second' | 'minute' | 'hour' | 'day';
  errorMessage?: string;
};

const API_RATE_CONFIGS: Record<string, LimiterConfig> = {
  // Auth-bezogene Endpoints
  'auth': {
    tokensPerInterval: 5,
    interval: 'minute',
    errorMessage: 'Zu viele Anmeldeversuche. Bitte versuche es später erneut.'
  },
  // Voiceover-Generierung (ressourcenintensiv)
  'voiceover': {
    tokensPerInterval: 5,
    interval: 'minute',
    errorMessage: 'Zu viele Voiceover-Anfragen. Bitte warte einen Moment.'
  },
  // Video-Generierung (sehr ressourcenintensiv)
  'video': {
    tokensPerInterval: 3,
    interval: 'minute',
    errorMessage: 'Zu viele Video-Generierungsanfragen. Bitte warte einen Moment.'
  },
  // Standard für allgemeine API-Endpunkte
  'default': {
    tokensPerInterval: 20,
    interval: 'minute',
    errorMessage: 'Zu viele Anfragen. Bitte versuche es später erneut.'
  }
};

/**
 * Prüft, ob eine Anfrage das Rate-Limit überschreitet
 * 
 * @param request Der NextRequest
 * @param type Der Endpunkt-Typ (auth, voiceover, video, default)
 * @param userId Optional: Benutzer-ID für benutzerspezifische Limits
 * @returns NextResponse mit 429-Status bei Überschreitung, sonst null
 */
export async function checkApiRateLimit(
  request: NextRequest, 
  type: keyof typeof API_RATE_CONFIGS = 'default',
  userId?: string
): Promise<NextResponse | null> {
  // IP-Adresse des Clients
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
  
  // Schlüssel basierend auf IP und optional Benutzer-ID
  const key = userId ? `${type}:${userId}` : `${type}:${ip}`;
  
  // Limiter-Konfiguration
  const config = API_RATE_CONFIGS[type];
  
  // Limiter holen oder erstellen
  if (!apiLimiters[key]) {
    apiLimiters[key] = new RateLimiter({
      tokensPerInterval: config.tokensPerInterval,
      interval: config.interval,
      fireImmediately: true
    });
  }
  
  // Prüfen, ob das Limit überschritten wurde
  const limiter = apiLimiters[key];
  const remainingRequests = await limiter.removeTokens(1);
  
  if (remainingRequests < 0) {
    console.warn(`API rate limit exceeded for ${key}`);
    return NextResponse.json(
      { 
        error: config.errorMessage || 'Rate limit exceeded',
        retryAfter: config.interval === 'second' ? 60 : 
                   config.interval === 'minute' ? 60 : 
                   config.interval === 'hour' ? 3600 : 86400
      },
      { 
        status: 429, 
        headers: {
          'Retry-After': config.interval === 'second' ? '60' : 
                         config.interval === 'minute' ? '60' : 
                         config.interval === 'hour' ? '3600' : '86400'
        }
      }
    );
  }
  
  return null;
}

/**
 * Wrapper-Funktion für API-Routen mit Rate-Limiting
 * 
 * @param handler Der API-Route-Handler
 * @param type Der Endpunkt-Typ (auth, voiceover, video, default)
 * @returns Ein Handler mit integriertem Rate-Limiting
 */
export function withApiRateLimit<T>(
  handler: (request: NextRequest) => Promise<T>, 
  type: keyof typeof API_RATE_CONFIGS = 'default'
) {
  return async (request: NextRequest) => {
    // API Rate-Limit prüfen
    const limitResponse = await checkApiRateLimit(request, type);
    if (limitResponse) {
      return limitResponse;
    }
    
    // Original-Handler ausführen
    return handler(request);
  };
} 