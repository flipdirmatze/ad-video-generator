import bcrypt from 'bcrypt';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import { generateVerificationToken, getTokenExpiryDate } from '@/lib/token-utils';
import { sendVerificationEmail } from '@/lib/email-sender';
import { withApiRateLimit } from '@/lib/api-rate-limiter';

// Bonus-Code für kostenlosen Premium-Zugang
const PROMO_CODE = 'EARLY2025';
const PROMO_PLAN = 'pro'; // Pro-Plan für frühe Nutzer

// Wrap the original handler with rate limiting
const originalPostHandler = async (request: NextRequest) => {
  try {
    const { email, password, name, bonusCode } = await request.json();

    // Validate inputs
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Connect to database using mongoose which is more efficient for serverless
    await dbConnect();
    const db = (await import('@/models/User')).default;
    
    // Check if user already exists - optimize with index
    const existingUser = await db.findOne({ email }).lean();
    
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }
    
    // Hash password with lower cost for faster processing
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Generate verification token and expiry date
    const verificationToken = generateVerificationToken();
    const verificationTokenExpires = getTokenExpiryDate();
    
    // Prüfe, ob ein gültiger Bonus-Code eingegeben wurde
    const isValidPromoCode = bonusCode === PROMO_CODE;
    
    // Bestimme Abonnementplan und Status basierend auf dem Bonus-Code
    const subscriptionPlan = isValidPromoCode ? PROMO_PLAN : 'free';
    const subscriptionActive = isValidPromoCode;
    
    // Create user with verification token and appropriate plan
    const newUser = new db({
      email,
      password: hashedPassword,
      name,
      createdAt: new Date(),
      role: 'user',
      subscriptionPlan,
      subscriptionActive,
      stats: {
        totalVideosCreated: 0,
        totalStorage: 0,
        lastActive: new Date()
      },
      emailVerified: null,
      verificationToken,
      verificationTokenExpires
    });
    
    // Wenn ein gültiger Promo-Code eingegeben wurde, aktualisiere die Limits
    if (isValidPromoCode) {
      // Direkt die Pro-Plan-Limits definieren, basierend auf den Werten aus User.ts
      newUser.limits = {
        maxVideosPerMonth: 50,
        maxVideoLength: 600, // 10 Minuten
        maxStorageSpace: 1024 * 1024 * 1024 * 10, // 10 GB
        maxResolution: "1080p", // HD
        maxUploadSize: 500 * 1024 * 1024, // 500MB
        allowedFeatures: ["templates"]
      };
    }
    
    const result = await newUser.save();
    
    // Send verification email
    await sendVerificationEmail({
      email,
      name,
      verificationToken
    });
    
    // Erstelle eine passende Erfolgsmeldung je nach Bonus-Code
    let message = 'Registration successful. Please check your email to verify your account.';
    if (isValidPromoCode) {
      message += ' Your account has been activated with the Pro plan for free as an early user!';
    } else {
      message += ' After verification, you will need to select a subscription plan to use the service.';
    }
    
    return NextResponse.json(
      { 
        success: true, 
        user: { 
          id: result._id,
          email,
          name,
          subscriptionPlan,
          subscriptionActive
        },
        message
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    // More descriptive error message
    const errorMessage = error instanceof Error ? error.message : 'Unknown registration error';
    return NextResponse.json(
      { error: 'Registration failed', details: errorMessage },
      { status: 500 }
    );
  }
};

// Export the wrapped handler with rate limiting for auth endpoints
export const POST = withApiRateLimit(originalPostHandler, 'auth'); 