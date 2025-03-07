import { NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongoose';
import User from '../../../models/User';
import mongoose from 'mongoose';

export async function GET() {
  try {
    // Verbindung zur Datenbank herstellen
    await dbConnect();
    
    // Anzahl der Benutzer in der Datenbank abrufen
    const userCount = await User.countDocuments();
    
    // Mongoose-Verbindungsstatus abrufen
    const connectionStatus = {
      readyState: mongoose.connection.readyState,
      // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
      status: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown'
    };
    
    return NextResponse.json({
      message: 'Mongoose-Verbindung erfolgreich hergestellt',
      userCount,
      connectionStatus,
      status: 'success'
    }, { status: 200 });
  } catch (error) {
    console.error('Mongoose-Verbindungsfehler:', error);
    return NextResponse.json({
      message: 'Fehler bei der Mongoose-Verbindung',
      error: error instanceof Error ? error.message : String(error),
      status: 'error'
    }, { status: 500 });
  }
} 