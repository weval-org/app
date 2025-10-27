import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getLogger } from '@/utils/logger';
import { callBackgroundFunction } from '@/lib/background-function-client';

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

const STORY_RUNS_DIR = 'live/story/runs';

export async function POST(req: NextRequest) {
  const logger = await getLogger('story:quick-run:start');
  const runId = `${Date.now()}-${uuidv4()}`;

  try {
    const body = await req.json();
    const { outline } = body;

    if (!outline) {
      return NextResponse.json({ error: 'Blueprint outline is required.' }, { status: 400 });
    }

    const blueprintKey = `${STORY_RUNS_DIR}/${runId}/blueprint.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: blueprintKey,
      Body: JSON.stringify(outline),
      ContentType: 'application/json',
    }));

    const statusKey = `${STORY_RUNS_DIR}/${runId}/status.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: statusKey,
      Body: JSON.stringify({ status: 'pending', message: 'Run accepted and queued.' }),
      ContentType: 'application/json',
    }));

    callBackgroundFunction({
      functionName: 'execute-story-quick-run-background',
      body: { runId, blueprintKey }
    }).catch(err => {
      logger.error(`Failed to invoke background function for runId ${runId}:`, err);
    });

    return NextResponse.json({ runId });

  } catch (error: any) {
    logger.error(`Failed to start quick run: ${error.message}`);
    return NextResponse.json({ error: 'Failed to start quick run.', details: error.message }, { status: 500 });
  }
}
