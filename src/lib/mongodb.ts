import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) {
  throw new Error('Please add your MongoDB URI to .env.local');
}

const uri = process.env.MONGODB_URI;
const options = {};

let client;
let clientPromise: Promise<MongoClient>;

// Definiere einen Typ für die MongoDB-Verbindungsinformationen
type MongoConnection = {
  conn: Promise<MongoClient> | null;
  promise: Promise<MongoClient> | null;
};

// Add global type for caching
const globalWithMongo = global as typeof globalThis & {
  mongo: MongoConnection;
};

// Initialize mongo property if it doesn't exist
if (!('mongo' in global)) {
  (global as typeof globalThis & { mongo?: MongoConnection }).mongo = {
    conn: null,
    promise: null
  };
}

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!globalWithMongo.mongo.conn) {
    client = new MongoClient(uri, options);
    globalWithMongo.mongo.conn = client.connect();
  }
  clientPromise = globalWithMongo.mongo.conn;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

// Export a module-scoped MongoClient promise. By doing this in a
// separate module, the client can be shared across functions.
export default clientPromise; 