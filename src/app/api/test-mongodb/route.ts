import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';

export async function GET() {
  try {
    // Client-Verbindung testen
    const client = await clientPromise;
    const db = client.db(); // Verbinde zur Standarddatenbank
    
    // Liste aller Collections in der Datenbank abrufen
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    return NextResponse.json({
      message: 'MongoDB-Verbindung erfolgreich hergestellt',
      collections: collectionNames,
      status: 'success'
    }, { status: 200 });
  } catch (error) {
    console.error('MongoDB-Verbindungsfehler:', error);
    return NextResponse.json({
      message: 'Fehler bei der MongoDB-Verbindung',
      error: error instanceof Error ? error.message : String(error),
      status: 'error'
    }, { status: 500 });
  }
} 