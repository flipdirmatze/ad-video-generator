import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import BonusCode from '@/models/BonusCode';
import User from '@/models/User';
import mongoose from 'mongoose';

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
        { success: false, reason: 'Invalid bonus code' },
        { status: 200 }
      );
    }
    
    // Benutzer aus der Datenbank holen
    const user = await User.findById(session.user.id);
    
    if (!user) {
      return NextResponse.json(
        { success: false, reason: 'User not found' },
        { status: 404 }
      );
    }
    
    // Code verwenden
    const useResult = bonusCode.useCode(new mongoose.Types.ObjectId(session.user.id));
    
    if (!useResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          reason: useResult.reason 
        },
        { status: 200 }
      );
    }
    
    // Benutzer-Abonnement aktualisieren
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + bonusCode.durationInDays);
    
    user.subscriptionPlan = bonusCode.plan;
    user.subscriptionActive = true;
    user.subscriptionExpiresAt = expirationDate;
    
    // Limits für den neuen Plan aktualisieren
    await user.updateLimitsForPlan(bonusCode.plan);
    
    // Bonus-Code speichern
    await bonusCode.save();
    
    return NextResponse.json(
      {
        success: true,
        plan: bonusCode.plan,
        durationInDays: bonusCode.durationInDays,
        expiresAt: expirationDate
      },
      { status: 200 }
    );
    
  } catch (error) {
    console.error('Error redeeming bonus code:', error);
    return NextResponse.json(
      { error: 'Failed to redeem bonus code' },
      { status: 500 }
    );
  }
} 