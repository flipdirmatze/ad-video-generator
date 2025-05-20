import bcrypt from 'bcrypt';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import { generateVerificationToken, getTokenExpiryDate } from '@/lib/token-utils';
import { sendVerificationEmail } from '@/lib/email-sender';
import { withApiRateLimit } from '@/lib/api-rate-limiter';

// Wrap the original handler with rate limiting
const originalPostHandler = async (request: NextRequest) => {
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
    
    // Create user with verification token and free plan
    const newUser = new db({
      email,
      password: hashedPassword,
      name,
      createdAt: new Date(),
      role: 'user',
      subscriptionPlan: 'free',
      subscriptionActive: false,
      stats: {
        totalVideosCreated: 0,
        totalStorage: 0,
        lastActive: new Date()
      },
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
        message: 'Registration successful. Please check your email to verify your account. After verification, you will need to select a subscription plan to use the service.'
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