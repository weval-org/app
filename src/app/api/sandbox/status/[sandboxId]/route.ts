import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const SANDBOX_V2_TEMP_DIR = 'live/sandbox';

// S3 Client Initialization
const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

// Helper to stream S3 object body to a string
const streamToString = (stream: Readable): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sandboxId: string }> }
) {
  const { sandboxId } = await params;

  if (!sandboxId) {
    return NextResponse.json({ error: 'Sandbox ID is required.' }, { status: 400 });
  }

  const statusKey = `${SANDBOX_V2_TEMP_DIR}/runs/${sandboxId}/status.json`;

  // Development logging
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Status API] Checking status for run: ${sandboxId}`);
    console.log(`[Status API] Looking for status file at: ${statusKey}`);
  }

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: statusKey,
    });

    const { Body } = await s3Client.send(command);

    if (!Body) {
      return NextResponse.json({ error: 'Status file not found or is empty.' }, { status: 404 });
    }

    const statusContent = await streamToString(Body as Readable);
    const statusJson = JSON.parse(statusContent);

    // Development logging  
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Status API] Returning status for ${sandboxId}:`, statusJson);
    }

    return NextResponse.json(statusJson);

  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      // This is a common case when polling starts before the file is created.
      // We return a 202 Accepted to indicate the process is likely still initializing.
      return new NextResponse(null, { status: 202 });
    }
    console.error(`Failed to fetch status for sandbox run ${sandboxId}:`, error);
    return NextResponse.json({ error: 'Failed to retrieve run status.', details: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic'; 