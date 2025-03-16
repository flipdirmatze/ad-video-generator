import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CloudWatchLogsClient, GetLogEventsCommand, LogEvent } from '@aws-sdk/client-cloudwatch-logs';
import { BatchClient, DescribeJobsCommand } from '@aws-sdk/client-batch';

export async function GET(
  request: NextRequest,
  context: { params: { jobId: string } }
) {
  try {
    // Sichere Authentifizierung
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jobId = context.params.jobId;
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    console.log(`Fetching detailed information for AWS Batch job: ${jobId}`);

    // Erstelle AWS Batch Client
    const batchClient = new BatchClient({
      region: process.env.AWS_REGION || 'eu-central-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
      }
    });

    // Hole detaillierte Job-Informationen
    const describeCommand = new DescribeJobsCommand({
      jobs: [jobId]
    });

    const jobResponse = await batchClient.send(describeCommand);
    const job = jobResponse.jobs?.[0];

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Extrahiere wichtige Informationen
    const jobDetails = {
      jobId: job.jobId,
      jobName: job.jobName,
      status: job.status,
      statusReason: job.statusReason,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      stoppedAt: job.stoppedAt,
      exitCode: job.container?.exitCode,
      reason: job.container?.reason,
      logStreamName: job.container?.logStreamName,
      environment: job.container?.environment?.map(env => ({
        name: env.name,
        value: env.value
      }))
    };

    // Wenn ein Log-Stream vorhanden ist, hole die Logs
    let logs: Array<{ timestamp?: number; message?: string }> = [];
    if (job.container?.logStreamName) {
      try {
        // Erstelle CloudWatch Logs Client
        const logsClient = new CloudWatchLogsClient({
          region: process.env.AWS_REGION || 'eu-central-1',
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
          }
        });

        // Hole die letzten 100 Log-Einträge
        const logCommand = new GetLogEventsCommand({
          logGroupName: '/aws/batch/job',
          logStreamName: job.container.logStreamName,
          limit: 100,
          startFromHead: false // Neueste Logs zuerst
        });

        const logResponse = await logsClient.send(logCommand);
        logs = logResponse.events?.map((event: LogEvent) => ({
          timestamp: event.timestamp,
          message: event.message
        })) || [];
      } catch (logError) {
        console.error('Error fetching CloudWatch logs:', logError);
        logs = [{ message: `Failed to fetch logs: ${logError instanceof Error ? logError.message : String(logError)}` }];
      }
    }

    return NextResponse.json({
      job: jobDetails,
      logs
    });
  } catch (error) {
    console.error(`Error fetching AWS Batch job details: ${error}`);
    return NextResponse.json(
      { 
        error: 'Failed to fetch AWS Batch job details', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 