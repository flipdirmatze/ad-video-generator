// AWS Configuration
export const awsConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'eu-central-1',
  bucketName: process.env.AWS_BUCKET_NAME,
}

// Validate required environment variables
if (!awsConfig.accessKeyId || !awsConfig.secretAccessKey || !awsConfig.bucketName) {
  throw new Error('Missing required AWS environment variables')
} 