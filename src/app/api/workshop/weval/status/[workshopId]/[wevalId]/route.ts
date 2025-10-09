import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

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
  { params }: { params: Promise<{ workshopId: string; wevalId: string }> }
) {
  const { workshopId, wevalId } = await params;

  if (!workshopId || !wevalId) {
    return NextResponse.json({ error: 'Workshop ID and Weval ID are required.' }, { status: 400 });
  }

  const statusKey = `live/workshop/runs/${workshopId}/${wevalId}/status.json`;

  // Development logging
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Weval Status API] Checking status for weval: ${workshopId}/${wevalId}`);
    console.log(`[Weval Status API] Looking for status file at: ${statusKey}`);
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

    // If status is complete, also fetch the result data
    if (statusJson.status === 'complete') {
      try {
        const resultKey = `live/workshop/runs/${workshopId}/${wevalId}/_comparison.json`;
        const resultCommand = new GetObjectCommand({
          Bucket: process.env.APP_S3_BUCKET_NAME!,
          Key: resultKey,
        });
        const { Body: ResultBody } = await s3Client.send(resultCommand);
        if (ResultBody) {
          const resultContent = await streamToString(ResultBody as Readable);
          const resultJson = JSON.parse(resultContent);
          statusJson.result = resultJson;
        }
      } catch (resultError: any) {
        console.error(`Failed to fetch result for weval ${workshopId}/${wevalId}:`, resultError);
        // Don't fail the request if result fetch fails, just don't include it
      }
    }

    // Development logging
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Weval Status API] Returning status for ${workshopId}/${wevalId}:`, statusJson.status);
    }

    return NextResponse.json(statusJson);

  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      // This is a common case when polling starts before the file is created.
      // We return a 202 Accepted to indicate the process is likely still initializing.
      return new NextResponse(null, { status: 202 });
    }
    console.error(`Failed to fetch status for weval ${workshopId}/${wevalId}:`, error);
    return NextResponse.json({ error: 'Failed to retrieve weval status.', details: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
