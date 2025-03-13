import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

// Überprüfe, ob MONGODB_URI gesetzt ist
if (!MONGODB_URI) {
  console.error('MongoDB Error: MONGODB_URI is not defined in environment variables');
  throw new Error(
    'Please define the MONGODB_URI environment variable inside Vercel environment variables or .env'
  );
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
interface CachedMongoose {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// Erstelle eine Namespace-Erweiterung für globalThis
declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: CachedMongoose | undefined;
}

// Globale Variable zur Verbindungs-Cache-Verwaltung
const globalMongoose = global as typeof globalThis & {
  mongooseCache?: CachedMongoose;
};

// Initialisiere den Cache, falls er nicht existiert
if (!globalMongoose.mongooseCache) {
  globalMongoose.mongooseCache = {
    conn: null,
    promise: null
  };
}

// Verwende den Cache
const cached = globalMongoose.mongooseCache;

async function dbConnect() {
  if (cached.conn) {
    console.log('Using existing Mongoose connection');
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 10000,
    };

    console.log('Creating new Mongoose connection');
    
    // Mehr Logs für Mongoose-Verbindung aktivieren
    mongoose.set('debug', true);
    
    cached.promise = mongoose.connect(MONGODB_URI!, opts)
      .then((mongoose) => {
        console.log('Mongoose connection successful');
        return mongoose;
      })
      .catch((error) => {
        console.error('Mongoose connection error:', error);
        throw error;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error('Failed to establish Mongoose connection:', e);
    throw e;
  }

  return cached.conn;
}

export default dbConnect; 