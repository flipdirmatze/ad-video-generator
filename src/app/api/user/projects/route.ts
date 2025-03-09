import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import db from '@/lib/db';

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
    
    // Get user's projects
    const projects = await db.project.findMany({
      where: {
        userId: session.user.id,
      },
      orderBy: {
        createdAt: 'desc',
      }
    });

    // Map projects to include only required fields
    const simplifiedProjects = projects.map(project => ({
      id: project.id,
      status: project.status,
      outputUrl: project.outputUrl,
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