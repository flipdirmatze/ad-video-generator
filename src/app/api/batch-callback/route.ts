import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongoose';
import ProjectModel from '@/models/Project';
import { getS3Url } from '@/lib/storage';

// Einen Secret-Key für mehr Sicherheit verwenden
const CALLBACK_SECRET = process.env.BATCH_CALLBACK_SECRET;

type BatchCallbackRequest = {
  jobId: string;
  status: 'success' | 'failed';
  outputKey?: string;
  error?: string;
  callbackSecret: string;
};

/**
 * Diese API-Route wird vom AWS Batch-Job aufgerufen, wenn der Job beendet wurde.
 * Sie aktualisiert den Status des Projekts in der Datenbank und setzt den Output-URL.
 */
export async function POST(request: Request) {
  try {
    const data: BatchCallbackRequest = await request.json();
    const { jobId, status, outputKey, error, callbackSecret } = data;

    // Verifiziere den Secret-Key
    if (!callbackSecret || callbackSecret !== CALLBACK_SECRET) {
      console.warn('Unauthorized batch callback attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Verbindung zur Datenbank herstellen
    await dbConnect();

    // Projekt finden
    const project = await ProjectModel.findOne({ batchJobId: jobId });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Status und andere Felder aktualisieren
    if (status === 'success' && outputKey) {
      project.status = 'completed';
      project.outputUrl = getS3Url(outputKey);
      project.error = null;
    } else {
      project.status = 'failed';
      project.error = error || 'Unknown error';
    }

    project.updatedAt = new Date();
    await project.save();

    return NextResponse.json({
      success: true,
      message: `Project ${project._id} status updated to ${status}`
    });
  } catch (error) {
    console.error('Error updating batch job status:', error);
    return NextResponse.json(
      { error: 'Failed to update job status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 