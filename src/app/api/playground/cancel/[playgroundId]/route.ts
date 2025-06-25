import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const PLAYGROUND_TEMP_DIR = 'playground';

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ playgroundId: string }> }
) {
  const { playgroundId } = await params;
  if (!playgroundId) {
    return NextResponse.json({ error: 'playgroundId is required' }, { status: 400 });
  }

  const cancelKey = `${PLAYGROUND_TEMP_DIR}/runs/${playgroundId}/cancel.json`;
  const statusKey = `${PLAYGROUND_TEMP_DIR}/runs/${playgroundId}/status.json`;

  try {
    // First, check if the run directory/status exists to avoid creating orphans.
    await s3Client.send(new HeadObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: statusKey,
    }));

    // Create a cancellation signal file (for the pipeline to eventually see)
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: cancelKey,
      Body: JSON.stringify({ cancelledAt: new Date().toISOString() }),
      ContentType: 'application/json',
    }));
    
    // Immediately update the status to give the user instant feedback
    await s3Client.send(new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: statusKey,
        Body: JSON.stringify({ status: 'error', message: 'Run cancelled by user.' }),
        ContentType: 'application/json',
    }));

    return NextResponse.json({ message: 'Cancellation request sent.' });
  } catch (error: any) {
    if (error.name === 'NotFound') {
        return NextResponse.json({ error: 'Run not found. Cannot cancel.' }, { status: 404 });
    }
    console.error(`[Cancel API] Error sending cancellation for ${playgroundId}.`, error);
    return NextResponse.json({ error: 'Failed to send cancellation request.' }, { status: 500 });
  }
} 