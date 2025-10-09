import { NextRequest, NextResponse } from 'next/server';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { getLogger } from '@/utils/logger';

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
  request: NextRequest,
  { params }: { params: Promise<{ workshopId: string }> }
) {
  const logger = await getLogger('workshop:gallery');
  const { workshopId } = await params;

  try {
    // List all wevals for this workshop
    const prefix = `live/workshop/wevals/${workshopId}/`;

    const listCommand = new ListObjectsV2Command({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Prefix: prefix,
    });

    const listResponse = await s3Client.send(listCommand);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return NextResponse.json({
        workshopId,
        wevals: [],
      });
    }

    // Fetch all weval files and filter for gallery items
    const wevalPromises = listResponse.Contents
      .filter(obj => obj.Key?.endsWith('.json'))
      .map(async (obj) => {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: process.env.APP_S3_BUCKET_NAME!,
            Key: obj.Key,
          });
          const { Body } = await s3Client.send(getCommand);
          if (!Body) return null;

          const content = await streamToString(Body as Readable);
          const weval = JSON.parse(content);

          // Only return wevals that are in the gallery AND have completed execution
          if (weval.inGallery && weval.executionStatus === 'complete') {
            return {
              wevalId: weval.wevalId,
              workshopId: weval.workshopId,
              description: weval.description,
              authorName: weval.authorName,
              executionStatus: weval.executionStatus,
              executionRunId: weval.executionRunId,
              createdAt: weval.createdAt,
              promptCount: weval.blueprint?.prompts?.length || 0,
            };
          }
          return null;
        } catch (error) {
          logger.warn(`Failed to fetch weval ${obj.Key}: ${error}`);
          return null;
        }
      });

    const allWevals = await Promise.all(wevalPromises);
    const galleryWevals = allWevals
      .filter(w => w !== null)
      .sort((a, b) => new Date(b!.createdAt).getTime() - new Date(a!.createdAt).getTime());

    logger.info(`[workshop:gallery] Retrieved ${galleryWevals.length} gallery wevals for ${workshopId}`);

    return NextResponse.json({
      workshopId,
      wevals: galleryWevals,
    });
  } catch (error: any) {
    logger.error(`[workshop:gallery] Failed for ${workshopId}: ${error?.message || error}`);
    return NextResponse.json(
      {
        error: 'Failed to retrieve gallery wevals',
        details: error?.message,
      },
      { status: 500 }
    );
  }
}
