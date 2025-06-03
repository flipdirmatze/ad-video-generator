import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import BonusCode from '@/models/BonusCode';

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
    
    // Daten aus dem Request-Body extrahieren
    const { code } = await req.json();
    
    if (!code) {
      return NextResponse.json(
        { error: 'Bonus code is required' },
        { status: 400 }
      );
    }
    
    // Code in der Datenbank suchen
    const bonusCode = await BonusCode.findOne({ 
      code: code.trim().toUpperCase() 
    });
    
    if (!bonusCode) {
      return NextResponse.json(
        { valid: false, reason: 'Invalid bonus code' },
        { status: 200 }
      );
    }
    
    // Überprüfen, ob der Code gültig ist
    const validityCheck = bonusCode.isValid();
    
    if (!validityCheck.valid) {
      return NextResponse.json(
        { 
          valid: false, 
          reason: validityCheck.reason 
        },
        { status: 200 }
      );
    }
    
    // Überprüfen, ob der Nutzer den Code bereits verwendet hat
    const alreadyUsed = bonusCode.usedBy.some(
      (entry: any) => entry.userId.toString() === session.user.id
    );
    
    if (alreadyUsed) {
      return NextResponse.json(
        { 
          valid: false, 
          reason: 'You have already used this code' 
        },
        { status: 200 }
      );
    }
    
    // Code ist gültig
    return NextResponse.json(
      {
        valid: true,
        plan: bonusCode.plan,
        durationInDays: bonusCode.durationInDays
      },
      { status: 200 }
    );
    
  } catch (error) {
    console.error('Error validating bonus code:', error);
    return NextResponse.json(
      { error: 'Failed to validate bonus code' },
      { status: 500 }
    );
  }
} 