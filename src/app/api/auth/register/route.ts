import bcrypt from 'bcrypt';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import { generateVerificationToken, getTokenExpiryDate } from '@/lib/token-utils';
import { sendVerificationEmail } from '@/lib/email-sender';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

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
    
    // Create user with verification token
    const newUser = new db({
      email,
      password: hashedPassword,
      name,
      createdAt: new Date(),
      role: 'user',
      subscriptionPlan: 'starter',
      subscriptionActive: true,
      limits: {
        maxVideosPerMonth: 10,
        maxVideoLength: 180, // 3 Minuten
        maxStorageSpace: 2 * 1024 * 1024 * 1024, // 2GB
        maxResolution: "720p",
        maxUploadSize: 150 * 1024 * 1024, // 150MB
        allowedFeatures: ["templates"]
      },
      stats: {
        totalVideosCreated: 0,
        totalStorage: 0,
        lastActive: new Date()
      },
      // E-Mail-Verifizierung
      emailVerified: null,
      verificationToken,
      verificationTokenExpires
    });
    
    const result = await newUser.save();
    
    // Send verification email
    await sendVerificationEmail({
      email,
      name,
      verificationToken
    });
    
    return NextResponse.json(
      { 
        success: true, 
        user: { 
          id: result._id,
          email,
          name 
        },
        message: 'Registration successful. Please check your email to verify your account.'
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
} 