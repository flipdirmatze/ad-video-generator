import bcrypt from 'bcrypt';
import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';

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
    
    // Create user
    const newUser = new db({
      email,
      password: hashedPassword,
      name,
      createdAt: new Date(),
      role: 'user',
      subscriptionPlan: 'starter',
      subscriptionActive: true,
      limits: {
        maxVideosPerMonth: 5,
        maxVideoLength: 60,
        maxStorageSpace: 500 * 1024 * 1024, // 500MB
        maxResolution: "720p",
        allowedFeatures: ["voiceover", "templates"]
      },
      stats: {
        totalVideosCreated: 0,
        totalStorage: 0,
        lastActive: new Date()
      },
      emailVerified: new Date()
    });
    
    const result = await newUser.save();
    
    return NextResponse.json(
      { 
        success: true, 
        user: { 
          id: result._id,
          email,
          name 
        } 
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