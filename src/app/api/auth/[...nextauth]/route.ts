import NextAuth, { NextAuthOptions, User as NextAuthUser } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { MongoDBAdapter } from '@auth/mongodb-adapter';
import clientPromise from '@/lib/mongodb';
import dbConnect from '@/lib/mongoose';
import User from '@/models/User';
import bcrypt from 'bcrypt';
import { JWT } from 'next-auth/jwt';
import { Session } from 'next-auth';

// Extend the User interface
interface CustomUser extends NextAuthUser {
  role?: string;
}

// Extend the JWT interface
interface CustomJWT extends JWT {
  role?: string;
}

// Extend the Session interface
interface CustomSession extends Session {
  user: {
    id: string;
    role: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }
}

// Extraktion gemeinsamer Logik in Funktionen
const getUserFromCredentials = async (credentials: any) => {
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

const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          role: 'user', // Default role for Google sign-ins
        };
      },
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: getUserFromCredentials
    }),
  ],
  pages: {
    signIn: '/auth/signin',
    signOut: '/',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      // Add role to JWT token when user signs in
      if (user) {
        token.role = (user as CustomUser).role || 'user';
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      // Add role to the session
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST }; 