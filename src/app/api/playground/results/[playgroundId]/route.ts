import { NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

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

  // The final result file is named _comparison.json in the run's directory
  const resultKey = `${PLAYGROUND_TEMP_DIR}/runs/${playgroundId}/_comparison.json`;

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: resultKey,
    });
    const { Body } = await s3Client.send(command);
    
    if (Body) {
      const content = await streamToString(Body as Readable);
      // We send the raw JSON content and set the content type header
      return new NextResponse(content, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } else {
      return NextResponse.json({ error: 'Result file not found.' }, { status: 404 });
    }
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      return NextResponse.json({ error: 'Result not found. The run may still be in progress or failed.' }, { status: 404 });
    }
    console.error(`Error fetching result for ${playgroundId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch run result.' }, { status: 500 });
  }
}
