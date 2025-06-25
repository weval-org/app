import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export const dynamic = 'force-dynamic';

const PLAYGROUND_TEMP_DIR = 'playground';

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

const streamToString = (stream: Readable): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ playgroundId: string }> }
) {
  const { playgroundId } = await params;
  if (!playgroundId) {
    return NextResponse.json({ error: 'playgroundId is required' }, { status: 400 });
  }

  const statusKey = `${PLAYGROUND_TEMP_DIR}/runs/${playgroundId}/status.json`;
  console.log(`[Status API] Attempting to fetch status for key: ${statusKey}`);

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: statusKey,
    });
    const { Body } = await s3Client.send(command);
    
    if (Body) {
      const content = await streamToString(Body as Readable);
      console.log(`[Status API] Found status for ${playgroundId}:`, content);
      return NextResponse.json(JSON.parse(content));
    } else {
      // This case is unlikely but handled
      console.warn(`[Status API] Status file not found for ${playgroundId}, but no error was thrown.`);
      return NextResponse.json({ status: 'pending', message: 'Status file not found.' }, { status: 404 });
    }
  } catch (error: any) {
    console.error(`[Status API] Error fetching status for ${playgroundId}. Key: ${statusKey}`, error);
    if (error.name === 'NoSuchKey') {
      // If the status file doesn't exist yet, it means the run is pending initialization
      console.log(`[Status API] 'NoSuchKey' error for ${playgroundId}, returning 202.`);
      return NextResponse.json({ status: 'pending', message: 'Run is initializing...' }, { status: 202 });
    }
    console.error(`Error fetching status for ${playgroundId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch run status.' }, { status: 500 });
  }
}
