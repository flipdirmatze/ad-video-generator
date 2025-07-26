import { NextRequest, NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { videoId, inputPath, startTime, endTime } = body;

    // Validate input
    if (!videoId || !inputPath || startTime === undefined || endTime === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: videoId, inputPath, startTime, endTime' },
        { status: 400 }
      );
    }

    console.log('Starting Lambda video trim job with payload:', { videoId, inputPath, startTime, endTime });

    // Invoke Lambda function
    const command = new InvokeCommand({
      FunctionName: 'video-trimmer',
      InvocationType: 'RequestResponse', // Synchronous call
      Payload: JSON.stringify({
        videoId,
        inputPath,
        startTime,
        endTime
      }),
    });

    const response = await lambdaClient.send(command);
    
    if (response.StatusCode !== 200) {
      throw new Error(`Lambda invocation failed with status: ${response.StatusCode}`);
    }

    // Decode response payload
    const responsePayload = response.Payload 
      ? JSON.parse(new TextDecoder().decode(response.Payload))
      : null;

    if (!responsePayload) {
      throw new Error('No response payload from Lambda function');
    }

    // Parse Lambda response body (since Lambda returns a nested response)
    const result = responsePayload.body 
      ? JSON.parse(responsePayload.body) 
      : responsePayload;

    console.log('Lambda response:', result);

    return NextResponse.json({
      success: result.success || false,
      videoId: result.videoId || videoId,
      outputKey: result.outputKey,
      message: result.message || 'Video processing completed',
      error: result.error,
    });

  } catch (error) {
    console.error('Lambda invocation error:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Failed to start video processing',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
} 