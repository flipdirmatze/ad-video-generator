import { Resend } from 'resend';

// Resend client initialisieren
export const resend = new Resend(process.env.RESEND_API_KEY);

// E-Mail-Absender (ändern Sie dies zu Ihrer Domain, sobald Sie sie in Resend verifiziert haben)
export const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

// URL für Verifizierungslinks - wird aus der NEXTAUTH_URL oder PUBLIC_APP_URL ermittelt
export const APP_URL = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'; 