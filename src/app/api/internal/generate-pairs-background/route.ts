import { NextRequest, NextResponse } from 'next/server';
import { getLogger } from '@/utils/logger';
import { listRunsForConfig, getResultByFileName } from '@/lib/storageService';
import { populatePairwiseQueue, updateGenerationStatus, GenerationStatus } from '@/cli/services/pairwise-task-queue-service';
import { ComparisonDataV2 as FetchedComparisonData } from '@/app/utils/types';
import { initSentry, captureError, setContext, flushSentry } from '@/utils/sentry';
import { checkBackgroundAuth } from '@/lib/background-function-auth';

async function runPairGeneration(body: any) {
  const { configId } = body;

  // Set Sentry context for this invocation
  setContext('generatePairs', {
    configId,
  });

  const logger = await getLogger(`pairs:generate-bg:${configId || 'unknown'}`);
  logger.info('Background function started');

  if (!configId) {
    logger.error('Missing configId in invocation.');
    captureError(new Error('Missing configId in invocation'), { body });
    await flushSentry();
    return;
  }

  logger.info(`Processing pairs generation for configId: ${configId}`);

  try {
    // Try to update status to 'generating'
    try {
      await updateGenerationStatus(configId, {
        status: 'generating',
        message: 'Fetching latest run for config...',
        timestamp: new Date().toISOString(),
      });
    } catch (statusError: any) {
      logger.error(`Failed to initialize status: ${statusError.message}`);
      throw new Error(`Failed to initialize blob storage: ${statusError.message}`);
    }

    // Fetch the latest run for this config
    const runs = await listRunsForConfig(configId);
    if (runs.length === 0) {
      await updateGenerationStatus(configId, {
        status: 'error',
        message: `No runs found for config ${configId}. Please run an evaluation first.`,
        timestamp: new Date().toISOString(),
      });
      logger.error(`No runs found for config ${configId}.`);
      return;
    }

    const latestRun = runs[0];
    logger.info(`Found latest run: ${latestRun.fileName}`);

    // Fetch the result data
    const resultData = await getResultByFileName(configId, latestRun.fileName) as FetchedComparisonData;
    if (!resultData) {
      await updateGenerationStatus(configId, {
        status: 'error',
        message: 'Could not fetch result data for latest run.',
        timestamp: new Date().toISOString(),
      });
      logger.error(`Could not fetch result data for file: ${latestRun.fileName}`);
      return;
    }

    // Update status with progress
    await updateGenerationStatus(configId, {
      status: 'generating',
      message: 'Generating comparison pairs...',
      timestamp: new Date().toISOString(),
    });

    // Generate the pairs
    const result = await populatePairwiseQueue(resultData, { logger });

    // Check if we failed due to missing anchor model
    if (result.anchorModelMissing) {
      await updateGenerationStatus(configId, {
        status: 'error',
        message: `Cannot generate pairs: evaluation results don't include the required anchor model 'openrouter:openai/gpt-4.1-mini'. Please run an evaluation that includes this model.`,
        timestamp: new Date().toISOString(),
        error: 'Missing anchor model',
      });
      logger.error(`Failed to generate pairs for ${configId}: anchor model missing from evaluation results.`);
      return;
    }

    // Update status to complete
    await updateGenerationStatus(configId, {
      status: 'complete',
      message: `Successfully generated ${result.tasksAdded} new comparison pairs.`,
      timestamp: new Date().toISOString(),
      tasksGenerated: result.tasksAdded,
      totalTasksInQueue: result.totalTasksInQueue,
    });

    logger.info(`Successfully generated ${result.tasksAdded} pairs for config ${configId}.`);
    await flushSentry();

  } catch (error: any) {
    const errorContext = {
      configId,
      message: error.message,
      stack: error.stack,
      name: error.name,
    };

    logger.error(`Failed to generate pairs for config ${configId}`, error);
    captureError(error, errorContext);

    try {
      await updateGenerationStatus(configId, {
        status: 'error',
        message: 'An error occurred during pair generation.',
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    } catch (statusUpdateError: any) {
      logger.error('Failed to update error status', statusUpdateError);
      captureError(statusUpdateError, { context: 'status-update-error', configId });
    }

    await flushSentry();
  }
}

export async function POST(req: NextRequest) {
  // Initialize Sentry for this function
  initSentry('generate-pairs-background');

  // Check authentication
  const authError = checkBackgroundAuth(req);
  if (authError) {
    console.error('[generate-pairs-background] Authentication failed');
    await flushSentry();
    return authError;
  }

  const body = await req.json();

  // Fire-and-forget the async work
  runPairGeneration(body);

  return NextResponse.json({ accepted: true }, { status: 202 });
}
