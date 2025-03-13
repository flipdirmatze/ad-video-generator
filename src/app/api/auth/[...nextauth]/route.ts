import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

// Vereinfachte Route, die nur den NextAuth-Handler exportiert
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 