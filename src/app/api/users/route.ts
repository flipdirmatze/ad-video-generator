import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../lib/mongoose';
import User from '../../../models/User';
import mongoose from 'mongoose';

// GET /api/users - Liste aller Benutzer abrufen
export async function GET() {
  try {
    await dbConnect();
    const users = await User.find({}).select('-password').lean();
    
    return NextResponse.json({
      users,
      count: users.length,
      status: 'success'
    }, { status: 200 });
  } catch (error) {
    console.error('Fehler beim Abrufen der Benutzer:', error);
    return NextResponse.json({
      message: 'Fehler beim Abrufen der Benutzer',
      error: error instanceof Error ? error.message : String(error),
      status: 'error'
    }, { status: 500 });
  }
}

// POST /api/users - Neuen Benutzer erstellen
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Verbindung zur Datenbank herstellen
    await dbConnect();
    
    // Prüfen, ob Benutzer bereits existiert
    const existingUser = await User.findOne({ email: body.email });
    
    if (existingUser) {
      return NextResponse.json({
        message: 'Benutzer mit dieser E-Mail existiert bereits',
        status: 'error'
      }, { status: 400 });
    }
    
    // Neuen Benutzer erstellen
    const newUser = await User.create({
      name: body.name,
      email: body.email,
      password: body.password, // In einer richtigen Anwendung würde das Passwort gehasht werden
      role: 'user'
    });
    
    // Passwort aus der Antwort entfernen
    const user = newUser.toObject();
    delete user.password;
    
    return NextResponse.json({
      message: 'Benutzer erfolgreich erstellt',
      user,
      status: 'success'
    }, { status: 201 });
  } catch (error) {
    console.error('Fehler beim Erstellen des Benutzers:', error);
    
    // Mongoose-Validierungsfehler behandeln
    if (error instanceof mongoose.Error.ValidationError) {
      const validationErrors = Object.values(error.errors).map((err) => err.message);
      
      return NextResponse.json({
        message: 'Validierungsfehler',
        errors: validationErrors,
        status: 'error'
      }, { status: 400 });
    }
    
    return NextResponse.json({
      message: 'Fehler beim Erstellen des Benutzers',
      error: error instanceof Error ? error.message : String(error),
      status: 'error'
    }, { status: 500 });
  }
} 