import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { rateLimiter } from '@/lib/rate-limiter';

export async function middleware(request: NextRequest) {
  // Führe zuerst den Rate Limiter aus
  const rateLimiterResponse = await rateLimiter(request);
  if (rateLimiterResponse) {
    return rateLimiterResponse;
  }

  // Get the pathname of the request
  const path = request.nextUrl.pathname;

  // Öffentliche Routen, die keinen Schutz benötigen
  const isPublicPath = path === '/auth/signin' || 
                       path === '/auth/signup' || 
                       path === '/auth/error' || 
                       path === '/pricing' || 
                       path.startsWith('/api/auth/') ||
                       path.startsWith('/logos/') ||
                       path === '/';

  const token = await getToken({ req: request });
  
  // Wenn kein Token, aber eine geschützte Route versucht wird
  if (!token && !isPublicPath) {
    return NextResponse.redirect(new URL('/auth/signin', request.url));
  }

  // Wenn ein Token vorhanden ist (Benutzer ist eingeloggt)
  if (token) {
    // Wenn der Benutzer bereits auf einer Auth-Seite ist, leite zum Dashboard weiter
    if (path === '/auth/signin' || path === '/auth/signup') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Prüfe, ob der Benutzer ein aktives Abonnement hat
    const hasActiveSubscription = token.subscriptionActive === true && 
                                  token.subscriptionPlan !== 'free';

    // Geschützte Routen, die ein aktives Abonnement erfordern
    const requiresSubscription = path.startsWith('/dashboard') || 
                               path.startsWith('/editor') || 
                               path.startsWith('/projects') || 
                               path.startsWith('/upload') ||
                               path.startsWith('/voiceover') ||
                               path.startsWith('/api/projects') ||
                               path.startsWith('/api/upload-video') ||
                               path.startsWith('/api/generate-voiceover') ||
                               path.startsWith('/api/get-upload-url');

    // Wenn eine Route ein Abonnement erfordert, aber der Benutzer keines hat
    if (requiresSubscription && !hasActiveSubscription && path !== '/pricing') {
      return NextResponse.redirect(new URL('/pricing', request.url));
    }
  }

  return NextResponse.next();
}

// Diese Middleware wird nur für die angegebenen Pfade ausgeführt
export const config = {
  matcher: [
    '/((?!api/batch-callback|_next/static|_next/image|favicon.ico|images|logos).*)',
  ],
}; 