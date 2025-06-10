import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';

export async function GET() {
  try {
    // Get the session
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'You must be signed in to access projects' },
        { status: 401 }
      );
    }
    
    // Connect to database
    await dbConnect();
    
    // Get user's projects
    const projects = await ProjectModel.find({
      userId: session.user.id
    })
    .sort({ createdAt: -1 });

    // Map projects to include only required fields
    const simplifiedProjects = projects.map(project => ({
      id: project._id.toString(),
      status: project.status,
      outputUrl: project.outputUrl,
      title: project.title,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));
    
    return NextResponse.json({
      projects: simplifiedProjects
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
} 