import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
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

// MongoDB-Cache-Wert im globalen Namespace
// eslint-disable-next-line no-var
declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: CachedMongoose;
}

// Definiere mongoose-Cache, wenn es nicht existiert
if (!global.mongooseCache) {
  // eslint-disable-next-line no-var
  global.mongooseCache = { conn: null, promise: null };
}

// Greife auf den Cache zu
const cached = global.mongooseCache;

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI!, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect; 