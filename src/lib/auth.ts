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
    subscriptionPlan: user.subscriptionPlan || 'starter',
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
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
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
    error: '/auth/error',
  },
  
  // Sitzungskonfiguration
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 Tage
  },
  
  // Erhöhen des Timeouts für Authentifizierungsanfragen
  debug: process.env.NODE_ENV === 'development',
  
  // Verbesserte Fehlerbehandlung
  callbacks: {
    async signIn({ user, account, profile }) {
      // Prüfen, ob es ein Google-Login ist
      if (account?.provider === 'google' && profile?.email) {
        try {
          await dbConnect();
          
          // Prüfen, ob User bereits existiert
          const existingUser = await User.findOne({ email: profile.email });
          
          // Wenn der User nicht existiert, erstellen wir einen neuen mit dem richtigen Plan
          if (!existingUser && user) {
            const newUser = new User({
              name: user.name,
              email: user.email,
              image: user.image,
              role: 'user',
              subscriptionPlan: 'starter',
              subscriptionActive: true,
              emailVerified: new Date(),
              stats: {
                totalVideosCreated: 0,
                totalStorage: 0,
                lastActive: new Date()
              }
            });
            
            await newUser.save();
            console.log(`New user created via Google: ${user.email}`);
          }
        } catch (error) {
          console.error('Error in Google signIn callback:', error);
          // Wir lassen den User trotzdem durch, auch wenn die DB-Operation fehlschlägt
        }
      }
      
      return true;
    },
    
    async jwt({ token, user, account }) {
      // Füge Rolle und ID zum JWT-Token hinzu, wenn sich der Benutzer anmeldet
      if (user) {
        token.role = user.role || 'user';
        token.id = user.id;
        
        // Füge Abonnement-Informationen hinzu
        token.subscriptionPlan = user.subscriptionPlan || 'starter';
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
        session.user.role = token.role as string;
        session.user.id = token.id as string;
        session.user.subscriptionPlan = token.subscriptionPlan || 'starter';
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
          }
        }
      }
      return session;
    },
  },
  
  // Verwende den NEXTAUTH_SECRET aus der Umgebungsvariable
  secret: process.env.NEXTAUTH_SECRET,
  
  // Sicherheitseinstellungen
  useSecureCookies: process.env.NODE_ENV === 'production',
}; 