import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// Debug: Log credential status (without revealing actual values)
console.log('AWS Credentials Debug:', {
  hasAccessKeyId: !!process.env.AWS_ACCESS_KEY_ID,
  accessKeyIdLength: process.env.AWS_ACCESS_KEY_ID?.length || 0,
  hasSecretAccessKey: !!process.env.AWS_SECRET_ACCESS_KEY,
  secretAccessKeyLength: process.env.AWS_SECRET_ACCESS_KEY?.length || 0,
  region: process.env.AWS_REGION || 'eu-central-1'
});

// Validate credentials before creating client
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  throw new Error('Missing AWS credentials. Please check your Vercel environment variables.');
}

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

export interface TrimVideoPayload {
  videoId: string;
  inputPath: string;
  startTime: number;
  endTime: number;
}

export interface LambdaResponse {
  success: boolean;
  videoId: string;
  outputKey?: string;
  message: string;
  error?: string;
}

/**
 * Startet einen Video-Trimming-Job über AWS Lambda
 */
export async function startVideoTrimJob(payload: TrimVideoPayload): Promise<LambdaResponse> {
  console.log('Starting Lambda video trim job with payload:', payload);

  try {
    const command = new InvokeCommand({
      FunctionName: 'video-trimmer', // Name Ihrer Lambda-Funktion
      InvocationType: 'RequestResponse', // Synchroner Aufruf
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);
    
    if (response.StatusCode !== 200) {
      throw new Error(`Lambda invocation failed with status: ${response.StatusCode}`);
    }

    // Response payload dekodieren
    const responsePayload = response.Payload 
      ? JSON.parse(new TextDecoder().decode(response.Payload))
      : null;

    if (!responsePayload) {
      throw new Error('No response payload from Lambda function');
    }

    // Lambda Response Body parsen (da Lambda eine verschachtelte Antwort zurückgibt)
    const result = responsePayload.body 
      ? JSON.parse(responsePayload.body) 
      : responsePayload;

    console.log('Lambda response:', result);

    return {
      success: result.success || false,
      videoId: result.videoId || payload.videoId,
      outputKey: result.outputKey,
      message: result.message || 'Video processing completed',
      error: result.error,
    };

  } catch (error) {
    console.error('Lambda invocation error:', error);
    
    return {
      success: false,
      videoId: payload.videoId,
      message: 'Failed to start video processing',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Alternative: Asynchroner Lambda-Aufruf (falls gewünscht)
 */
export async function startVideoTrimJobAsync(payload: TrimVideoPayload): Promise<{ success: boolean; message: string }> {
  console.log('Starting async Lambda video trim job with payload:', payload);

  try {
    const command = new InvokeCommand({
      FunctionName: 'video-trimmer',
      InvocationType: 'Event', // Asynchroner Aufruf
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);
    
    if (response.StatusCode !== 202) {
      throw new Error(`Async Lambda invocation failed with status: ${response.StatusCode}`);
    }

    return {
      success: true,
      message: 'Video processing started successfully',
    };

  } catch (error) {
    console.error('Async Lambda invocation error:', error);
    
    return {
      success: false,
      message: 'Failed to start video processing',
    };
  }
} 