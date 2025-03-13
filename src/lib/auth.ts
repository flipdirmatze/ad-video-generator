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

  // Return user object including subscription info
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    username: user.username,
    subscriptionPlan: user.subscriptionPlan || 'free',
    subscriptionActive: user.subscriptionActive ?? true,
    limits: user.limits,
    stats: user.stats
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
          // Setzen des Standard-Abonnements für neue Benutzer
          subscriptionPlan: 'free',
          subscriptionActive: true
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
          // Explizit null zurückgeben und keinen Fehler werfen
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
        
        // Füge Abonnement-Informationen hinzu
        token.subscriptionPlan = user.subscriptionPlan || 'free';
        token.subscriptionActive = user.subscriptionActive ?? true;
        token.hasLimits = !!user.limits;
      }
      
      // Zusätzliche Informationen über den Provider speichern
      if (account) {
        token.provider = account.provider;
      }
      
      return token;
    },
    
    async session({ session, token, user }) {
      // Füge Rolle und ID zur Session hinzu
      if (session.user) {
        try {
          session.user.role = token.role as string || 'user';
          session.user.id = token.id as string;
          session.user.subscriptionPlan = token.subscriptionPlan || 'free';
          session.user.subscriptionActive = token.subscriptionActive ?? true;
          
          // Wenn der Adapter verwendet wird, ist user verfügbar
          if (user) {
            // Füge zusätzliche Informationen aus der Datenbank hinzu
            try {
              const dbUser = await User.findById(token.id);
              if (dbUser) {
                session.user.limits = dbUser.limits;
                session.user.stats = dbUser.stats;
                session.user.username = dbUser.username;
              }
            } catch (error) {
              console.error('Error fetching user details for session:', error);
              // Fehler beim Abrufen von Benutzerdetails sollten die Session nicht blockieren
            }
          }
        } catch (error) {
          console.error('Error building session:', error);
          // Mindestanforderungen für die Session sicherstellen
          session.user.role = 'user';
          session.user.subscriptionPlan = 'free';
          session.user.subscriptionActive = true;
        }
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