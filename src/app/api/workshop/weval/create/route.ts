import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import * as yaml from 'js-yaml';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { saveJsonFile } from '@/lib/storageService';
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

const createWevalSchema = z.object({
  workshopId: z.string().min(1),
  sessionId: z.string().min(1),
  blueprint: z.object({}).passthrough(),
  authorName: z.string().optional(), // "Anonymous" if not provided
  description: z.string().optional(), // From blueprint.description if not provided
  inGallery: z.boolean(),
});

// Core models for workshop wevals
const CORE_MODELS = [
  "openrouter:openai/gpt-4o",
  "openrouter:openai/gpt-4o-mini",
  "openrouter:google/gemma-3-12b-it",
  "openrouter:anthropic/claude-3.5-haiku",
  "openrouter:qwen/qwen3-30b-a3b-instruct-2507",
  "openrouter:anthropic/claude-sonnet-4.5",
  "openrouter:mistralai/mistral-medium-3",
  "openrouter:meta-llama/llama-3-70b-instruct",
  "openrouter:google/gemini-2.5-flash",
  "openrouter:deepseek/deepseek-chat-v3.1"
];

// Generate random weval ID
function generateWevalId(): string {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 12);
}

export async function POST(request: NextRequest) {
  const logger = await getLogger('workshop:weval:create');

  try {
    const body = await request.json();
    const { workshopId, sessionId, blueprint, authorName, description, inGallery } = createWevalSchema.parse(body);

    // Generate unique weval ID
    const wevalId = generateWevalId();

    logger.info(`[workshop:weval:create] Creating weval ${wevalId} for workshop ${workshopId}`);

    // Prepare blueprint with core models and explicit evaluation config
    const wevalBlueprint = {
      ...blueprint,
      models: CORE_MODELS,
      evaluationConfig: {
        'embedding': { enabled: true },
        'llm-coverage': { enabled: true },
      },
    };

    logger.info(`[workshop:weval:create] Blueprint prepared with ${CORE_MODELS.length} models and full evaluation config`);

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
        Body: yaml.dump(wevalBlueprint),
        ContentType: 'application/yaml',
      }));

      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.APP_S3_BUCKET_NAME!,
        Key: statusKey,
        Body: JSON.stringify({ status: 'pending', message: 'Weval accepted and queued.' }),
        ContentType: 'application/json',
      }));

      // Invoke the background Netlify function
      logger.info(`[workshop:weval:create] Invoking background function for execution`);
      logger.info(`[workshop:weval:create] Payload:`, { runId: executionRunId, blueprintKey, sandboxVersion: 'v2' });

      try {
        const invocationResponse = await callBackgroundFunction({
          functionName: 'execute-sandbox-pipeline-background',
          body: { runId: executionRunId, blueprintKey, sandboxVersion: 'v2' }
        });

        logger.info(`[workshop:weval:create] Background function invocation response: ${invocationResponse.status}`);

        if (!invocationResponse.ok) {
          logger.error(`[workshop:weval:create] Background function failed: ${invocationResponse.status} - ${invocationResponse.error || 'Unknown error'}`);
          executionStatus = 'error';
        } else {
          logger.info(`[workshop:weval:create] Started execution ${executionRunId}`);
        }
      } catch (fetchError: any) {
        logger.error(`[workshop:weval:create] Failed to invoke background function: ${fetchError.message}`);
        executionStatus = 'error';
      }
    } catch (error: any) {
      logger.error(`[workshop:weval:create] Error starting execution: ${error.message}`);
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

    // Save weval
    const weval = {
      wevalId,
      workshopId,
      sessionId,
      blueprint: wevalBlueprint,
      authorName: authorName || 'Anonymous',
      description: description || blueprint.description || 'No description',
      inGallery,
      executionRunId,
      executionStatus,
      createdAt: new Date().toISOString(),
    };

    const wevalPath = WorkshopPaths.weval(workshopId, wevalId);
    await saveJsonFile(wevalPath, weval);

    logger.info(`[workshop:weval:create] Created weval ${wevalId}`);

    // Return the weval ID and URL
    return NextResponse.json({
      success: true,
      wevalId,
      wevalUrl: `/workshop/${workshopId}/weval/${wevalId}`,
      executionRunId,
    });
  } catch (error: any) {
    logger.error(`[workshop:weval:create] Error: ${error.message}`);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create weval' },
      { status: 500 }
    );
  }
}
