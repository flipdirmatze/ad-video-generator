import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import clientPromise from '@/lib/mongodb';
import dbConnect from '@/lib/mongoose';
import User from '@/models/User';
import bcrypt from 'bcrypt';
import { ObjectId } from 'mongodb';

// Typsichere Credential-Validierung
interface Credentials {
  email: string;
  password: string;
}

// Validierung der Benutzeranmeldedaten 
const getUserFromCredentials = async (credentials: Credentials) => {
  if (!credentials?.email || !credentials?.password) {
    throw new Error('Email and password are required');
  }

  await dbConnect();

  // Find user by email
  const user = await User.findOne({ email: credentials.email });

  if (!user || !user.password) {
    throw new Error('No user found with this email or invalid login method');
  }

  // Check password
  const isPasswordValid = await bcrypt.compare(credentials.password, user.password);

  if (!isPasswordValid) {
    throw new Error('Invalid password');
  }

  // Return user object
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
  };
};

export const authOptions: NextAuthOptions = {
  // Wir verwenden den MongoDB-Adapter für Benutzerpersistenz
  adapter: MongoDBAdapter(clientPromise),
  
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      // Passen der Benutzerdaten aus Google an
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          // Setzen der Standard-Rolle für Google-Anmeldungen
          role: 'user',
        };
      },
    }),
    CredentialsProvider({
      name: 'credentials',
      // Definieren der Anmeldedaten-Felder
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'example@domain.com' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        if (!credentials) return null;
        
        try {
          // Verwenden der separaten Funktion für die Validierung
          return await getUserFromCredentials(credentials as Credentials);
        } catch (error) {
          console.error('Authentication error:', error);
          return null;
        }
      }
    }),
  ],
  
  // Anpassen der Auth-Seiten
  pages: {
    signIn: '/auth/signin',
    signOut: '/',
    error: '/auth/error',
    // Hier können später weitere benutzerdefinierte Seiten hinzugefügt werden
  },
  
  // Session-Konfiguration
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 Tage
  },
  
  // Callbacks für Token und Session-Anpassung
  callbacks: {
    async jwt({ token, user, account }) {
      // Füge Rolle und ID zum JWT-Token hinzu, wenn sich der Benutzer anmeldet
      if (user) {
        token.role = user.role || 'user';
        token.id = user.id;
      }
      
      // Zusätzliche Informationen über den Provider speichern
      if (account) {
        token.provider = account.provider;
      }
      
      return token;
    },
    
    async session({ session, token }) {
      // Füge Rolle und ID zur Session hinzu
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        // Wir könnten hier auch den Provider hinzufügen, wenn gewünscht
        // session.user.provider = token.provider as string;
      }
      return session;
    },
  },
  
  // Verwende den NEXTAUTH_SECRET aus der Umgebungsvariable
  secret: process.env.NEXTAUTH_SECRET,
  
  // Debug-Modus in Entwicklungsumgebung aktivieren
  debug: process.env.NODE_ENV === 'development',
  
  // Sicherheitseinstellungen
  useSecureCookies: process.env.NODE_ENV === 'production',
}; 