import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

// Der einfachste Ansatz mit dem App Router, laut der offiziellen NextAuth-Dokumentation
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 