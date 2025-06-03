import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import BonusCode from '@/models/BonusCode';
import { SubscriptionPlan } from '@/lib/subscription-plans';
import mongoose from 'mongoose';
import crypto from 'crypto';

// Funktion zum Generieren eines zufälligen Codes
function generateRandomCode(length: number = 8): string {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length)
    .toUpperCase();
}

export async function POST(req: NextRequest) {
  try {
    // Verbindung zur Datenbank herstellen
    await dbConnect();
    
    // Session überprüfen
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Überprüfen, ob der Benutzer ein Administrator ist
    const isAdmin = session.user.role === 'admin';
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Only administrators can create bonus codes' },
        { status: 403 }
      );
    }
    
    // Daten aus dem Request-Body extrahieren
    const { 
      code: providedCode, 
      plan = 'pro', 
      durationInDays = 90, 
      maxUses = 1,
      expiresAt = null
    } = await req.json();
    
    // Wenn kein Code angegeben wurde, einen generieren
    const code = providedCode || generateRandomCode(8);
    
    // Überprüfen, ob der Code bereits existiert
    const existingCode = await BonusCode.findOne({ code: code.trim().toUpperCase() });
    
    if (existingCode) {
      return NextResponse.json(
        { error: 'Code already exists' },
        { status: 400 }
      );
    }
    
    // Neuen Bonus-Code erstellen
    const bonusCode = new BonusCode({
      code: code.trim().toUpperCase(),
      plan: plan as SubscriptionPlan,
      durationInDays,
      maxUses,
      createdBy: new mongoose.Types.ObjectId(session.user.id),
      expiresAt: expiresAt ? new Date(expiresAt) : undefined
    });
    
    // Bonus-Code speichern
    await bonusCode.save();
    
    return NextResponse.json(
      {
        success: true,
        code: bonusCode.code,
        plan: bonusCode.plan,
        durationInDays: bonusCode.durationInDays,
        maxUses: bonusCode.maxUses,
        expiresAt: bonusCode.expiresAt
      },
      { status: 201 }
    );
    
  } catch (error) {
    console.error('Error creating bonus code:', error);
    return NextResponse.json(
      { error: 'Failed to create bonus code' },
      { status: 500 }
    );
  }
} 