import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';

/**
 * Handler für die E-Mail-Verifikation
 * Der Token wird aus der URL gelesen und geprüft
 */
export async function GET(request: NextRequest) {
  try {
    // Token aus der URL lesen
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get('token');
    
    if (!token) {
      return NextResponse.redirect(new URL('/auth/error?error=missing-token', request.url));
    }
    
    // Mit der Datenbank verbinden
    await dbConnect();
    const User = (await import('@/models/User')).default;
    
    // Benutzer mit dem Token suchen
    const user = await User.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: new Date() } // Token muss noch gültig sein
    });
    
    if (!user) {
      return NextResponse.redirect(new URL('/auth/error?error=invalid-token', request.url));
    }
    
    // E-Mail-Adresse verifizieren und Token löschen
    user.emailVerified = new Date();
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();
    
    // Weiterleitung zur Login-Seite mit Erfolgsnachricht
    return NextResponse.redirect(new URL('/auth/signin?verified=1', request.url));
  } catch (error) {
    console.error('Email verification error:', error);
    return NextResponse.redirect(new URL('/auth/error?error=verification-failed', request.url));
  }
} 