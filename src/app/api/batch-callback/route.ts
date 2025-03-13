import { NextRequest, NextResponse } from 'next/server';
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
export async function POST(request: NextRequest) {
  console.log('Batch callback received');
  
  try {
    const data: BatchCallbackRequest = await request.json();
    const { jobId, status, outputKey, error, callbackSecret } = data;
    
    console.log(`Processing callback for job ${jobId} with status ${status}`);

    // Verifiziere den Secret-Key
    if (CALLBACK_SECRET && (!callbackSecret || callbackSecret !== CALLBACK_SECRET)) {
      console.warn(`Unauthorized batch callback attempt: ${jobId}`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!jobId) {
      console.warn('Missing jobId in batch callback');
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    if (!status || !['success', 'failed'].includes(status)) {
      console.warn(`Invalid status in batch callback: ${status}`);
      return NextResponse.json({ error: 'Valid status (success or failed) is required' }, { status: 400 });
    }

    // Verbindung zur Datenbank herstellen
    await dbConnect();

    // Projekt finden
    const project = await ProjectModel.findOne({ batchJobId: jobId });
    if (!project) {
      console.warn(`Project not found for job ID: ${jobId}`);
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Status und andere Felder aktualisieren
    if (status === 'success' && outputKey) {
      console.log(`Job ${jobId} completed successfully, output: ${outputKey}`);
      project.status = 'completed';
      project.outputUrl = getS3Url(outputKey);
      project.error = null;
    } else {
      const errorMessage = error || 'Unknown error';
      console.error(`Job ${jobId} failed: ${errorMessage}`);
      project.status = 'failed';
      project.error = errorMessage;
    }

    project.updatedAt = new Date();
    await project.save();
    console.log(`Project ${project._id} updated with status: ${project.status}`);

    return NextResponse.json({
      success: true,
      message: `Project ${project._id} status updated to ${project.status}`,
      projectId: project._id,
      status: project.status
    });
  } catch (error) {
    console.error('Error processing batch callback:', error);
    return NextResponse.json(
      { 
        error: 'Failed to update job status', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 