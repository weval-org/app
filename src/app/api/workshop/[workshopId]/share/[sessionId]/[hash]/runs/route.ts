import { NextRequest, NextResponse } from 'next/server';
import { getLogger } from '@/utils/logger';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * List all runs for a specific blueprint
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workshopId: string; sessionId: string; hash: string }> }
) {
  const logger = await getLogger('workshop:runs:list');
  const { workshopId, sessionId, hash } = await context.params;

  try {
    // List all folders under runs/{workshopId}/{sessionId}/{hash}/
    const prefix = `live/workshop/runs/${workshopId}/${sessionId}/${hash}/`;

    const command = new ListObjectsV2Command({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Prefix: prefix,
      Delimiter: '/',
    });

    const response = await s3Client.send(command);

    // Extract run IDs from CommonPrefixes
    const runs = (response.CommonPrefixes || [])
      .map((prefix) => {
        const parts = prefix.Prefix?.split('/').filter(Boolean);
        return parts?.[parts.length - 1];
      })
      .filter(Boolean) as string[];

    logger.info(`[workshop:runs:list] Found ${runs.length} runs for ${workshopId}/${sessionId}/${hash}`);

    // Sort by timestamp descending (assuming runIds are UUIDs with timestamps)
    runs.sort().reverse();

    return NextResponse.json({
      workshopId,
      sessionId,
      hash,
      runs,
    });
  } catch (error: any) {
    logger.error(`[workshop:runs:list] Failed: ${error?.message || error}`);
    return NextResponse.json(
      {
        error: 'Failed to list runs',
        details: error?.message,
      },
      { status: 500 }
    );
  }
}
