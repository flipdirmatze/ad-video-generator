import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import { v4 as uuidv4 } from 'uuid';

/**
 * POST /api/workflow-state
 * Speichert den aktuellen Workflow-Status eines Projekts
 */
export async function POST(request: NextRequest) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Daten aus dem Request-Body extrahieren
    const data = await request.json();
    const { 
      projectId, 
      workflowStep, 
      matchedVideos, 
      scriptSegments, 
      voiceoverId,
      voiceoverScript,
      title = 'Neues Projekt' 
    } = data;

    // Mit Datenbank verbinden
    await dbConnect();

    // Projekt aktualisieren oder erstellen
    let project;
    if (projectId) {
      // Existierendes Projekt aktualisieren
      project = await ProjectModel.findById(projectId);

      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }

      // Prüfen, ob das Projekt dem aktuellen Benutzer gehört
      if (project.userId.toString() !== session.user.id) {
        return NextResponse.json({ error: 'Not authorized to update this project' }, { status: 403 });
      }

      // Projekt aktualisieren
      project.workflowStep = workflowStep || project.workflowStep;
      
      if (matchedVideos) {
        project.matchedVideos = matchedVideos;
      }
      
      if (scriptSegments) {
        project.scriptSegments = scriptSegments;
      }
      
      if (voiceoverId) {
        project.voiceoverId = voiceoverId;
      }
      
      if (voiceoverScript) {
        project.voiceoverScript = voiceoverScript;
      }
      
      project.updatedAt = new Date();
      await project.save();
    } else {
      // Neues Projekt erstellen
      project = await ProjectModel.create({
        userId: session.user.id,
        title,
        workflowStep: workflowStep || 'voiceover',
        status: 'pending',
        segments: [],
        matchedVideos: matchedVideos || [],
        scriptSegments: scriptSegments || [],
        voiceoverId: voiceoverId || null,
        voiceoverScript: voiceoverScript || ''
      });
    }

    return NextResponse.json({
      success: true,
      projectId: project._id.toString(),
      workflowStep: project.workflowStep
    });
  } catch (error) {
    console.error('Error saving workflow state:', error);
    return NextResponse.json(
      { 
        error: 'Failed to save workflow state', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workflow-state?projectId=123
 * Ruft den aktuellen Workflow-Status eines Projekts ab
 */
export async function GET(request: NextRequest) {
  try {
    // Authentifizierung prüfen
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Projekt-ID aus der URL extrahieren
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Mit Datenbank verbinden
    await dbConnect();

    // Projekt abrufen
    const project = await ProjectModel.findById(projectId);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Prüfen, ob das Projekt dem aktuellen Benutzer gehört
    if (project.userId.toString() !== session.user.id) {
      return NextResponse.json({ error: 'Not authorized to access this project' }, { status: 403 });
    }

    // Projekt-Daten zurückgeben
    return NextResponse.json({
      success: true,
      project: {
        id: project._id.toString(),
        title: project.title,
        workflowStep: project.workflowStep,
        status: project.status,
        matchedVideos: project.matchedVideos || [],
        scriptSegments: project.scriptSegments || [],
        voiceoverId: project.voiceoverId,
        voiceoverScript: project.voiceoverScript,
        outputUrl: project.outputUrl,
        progress: project.progress || 0,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching workflow state:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch workflow state', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 