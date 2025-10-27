import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import * as yaml from 'js-yaml';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getJsonFile, saveJsonFile } from '@/lib/storageService';
import { WorkshopPaths } from '@/lib/workshop-utils';
import { getLogger } from '@/utils/logger';
import { callBackgroundFunction } from '@/lib/background-function-client';

// S3 Client Initialization
const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workshopId: string; wevalId: string }> }
) {
  const logger = await getLogger('workshop:weval:retry');

  try {
    const { workshopId, wevalId } = await params;

    logger.info(`[workshop:weval:retry] Retrying execution for ${workshopId}/${wevalId}`);

    // Fetch the weval
    const wevalPath = WorkshopPaths.weval(workshopId, wevalId);
    const weval = await getJsonFile<{
      wevalId: string;
      workshopId: string;
      sessionId: string;
      blueprint: any;
      authorName: string;
      description: string;
      inGallery: boolean;
      executionRunId: string | null;
      executionStatus: string;
      createdAt: string;
    }>(wevalPath);

    if (!weval) {
      return NextResponse.json(
        { error: 'Weval not found' },
        { status: 404 }
      );
    }

    // Kick off background execution using Netlify function
    const executionRunId = `${Date.now()}-${uuidv4()}`;
    let executionStatus: 'pending' | 'error' = 'pending';

    try {
      // Save blueprint and initial status to S3
      const blueprintKey = `live/workshop/runs/${workshopId}/${wevalId}/blueprint.yml`;
      const statusKey = `live/workshop/runs/${workshopId}/${wevalId}/status.json`;

      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: blueprintKey,
        Body: yaml.dump(weval.blueprint),
        ContentType: 'application/yaml',
      }));

      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: statusKey,
        Body: JSON.stringify({ status: 'pending', message: 'Weval retry accepted and queued.' }),
        ContentType: 'application/json',
      }));

      // Invoke the background Netlify function (fire-and-forget)
      callBackgroundFunction({
        functionName: 'execute-sandbox-pipeline-background',
        body: { runId: executionRunId, blueprintKey, sandboxVersion: 'v2' }
      }).catch(console.error);

      logger.info(`[workshop:weval:retry] Started execution ${executionRunId}`);
    } catch (error: any) {
      logger.error(`[workshop:weval:retry] Error starting execution: ${error.message}`);
      executionStatus = 'error';

      // Best-effort error status update
      try {
        const statusKey = `live/workshop/runs/${workshopId}/${wevalId}/status.json`;
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.APP_S3_BUCKET_NAME!,
          Key: statusKey,
          Body: JSON.stringify({ status: 'error', message: 'Failed to start the evaluation pipeline.', details: error.message }),
          ContentType: 'application/json',
        }));
      } catch (e) {
        console.error('Failed to update error status:', e);
      }
    }

    // Update weval with new execution info
    const updatedWeval = {
      ...weval,
      executionRunId,
      executionStatus,
    };

    await saveJsonFile(wevalPath, updatedWeval);

    logger.info(`[workshop:weval:retry] Updated weval with execution ${executionRunId}`);

    return NextResponse.json({
      success: true,
      executionRunId,
      executionStatus,
    });
  } catch (error: any) {
    logger.error(`[workshop:weval:retry] Error: ${error.message}`);

    return NextResponse.json(
      { error: 'Failed to retry execution' },
      { status: 500 }
    );
  }
}
