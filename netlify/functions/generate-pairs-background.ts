import type { BackgroundHandler } from '@netlify/functions';
import { getLogger } from '@/utils/logger';
import { listRunsForConfig, getResultByFileName } from '@/lib/storageService';
import { populatePairwiseQueue, updateGenerationStatus, GenerationStatus } from '@/cli/services/pairwise-task-queue-service';
import { ComparisonDataV2 as FetchedComparisonData } from '@/app/utils/types';
import { initSentry, captureError, setContext, flushSentry } from '@/utils/sentry';
import { checkBackgroundFunctionAuth } from '@/lib/background-function-auth';

export const handler: BackgroundHandler = async (event, context) => {
  // Initialize Sentry for this function
  initSentry('generate-pairs-background');

  // Check authentication
  const authError = checkBackgroundFunctionAuth(event);
  if (authError) {
    console.error('[generate-pairs-background] Authentication failed:', authError);
    await flushSentry();
    return; // Background handlers return void, not responses
  }

  const body = event.body ? JSON.parse(event.body) : {};
  const { configId } = body;

  // Extract blob credentials from event (available in background functions)
  // The blobs field is not in the TypeScript types but is present at runtime
  let blobContext: any = context;
  const eventWithBlobs = event as any;
  if (eventWithBlobs.blobs) {
    try {
      const blobsData = JSON.parse(Buffer.from(eventWithBlobs.blobs, 'base64').toString('utf-8'));

      // Extract siteId from headers - required for manual blob store configuration
      const siteId = event.headers['x-nf-site-id'];

      blobContext = {
        ...context,
        blobs: {
          ...blobsData,
          siteId
        }
      };
    } catch (e) {
      // Non-critical error, continue without blob context
    }
  }

  // Set Sentry context for this invocation
  setContext('generatePairs', {
    configId,
    netlifyContext: event.headers?.['x-nf-request-id'],
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
      }, { context: blobContext });
    } catch (statusError: any) {
      // If we can't even update status, log and fail early
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
      }, { context: blobContext });
      logger.error(`No runs found for config ${configId}.`);
      return;
    }

    const latestRun = runs[0]; // listRunsForConfig returns sorted by newest first
    logger.info(`Found latest run: ${latestRun.fileName}`);

    // Fetch the result data
    const resultData = await getResultByFileName(configId, latestRun.fileName) as FetchedComparisonData;
    if (!resultData) {
      await updateGenerationStatus(configId, {
        status: 'error',
        message: 'Could not fetch result data for latest run.',
        timestamp: new Date().toISOString(),
      }, { context: blobContext });
      logger.error(`Could not fetch result data for file: ${latestRun.fileName}`);
      return;
    }

    // Update status with progress
    await updateGenerationStatus(configId, {
      status: 'generating',
      message: 'Generating comparison pairs...',
      timestamp: new Date().toISOString(),
    }, { context: blobContext });

    // Generate the pairs
    const result = await populatePairwiseQueue(resultData, { logger, context: blobContext });

    // Check if we failed due to missing anchor model
    if (result.anchorModelMissing) {
      await updateGenerationStatus(configId, {
        status: 'error',
        message: `Cannot generate pairs: evaluation results don't include the required anchor model 'openrouter:openai/gpt-4.1-mini'. Please run an evaluation that includes this model.`,
        timestamp: new Date().toISOString(),
        error: 'Missing anchor model',
      }, { context: blobContext });
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
    }, { context: blobContext });

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
      }, { context: blobContext });
    } catch (statusUpdateError: any) {
      logger.error('Failed to update error status', statusUpdateError);
      captureError(statusUpdateError, { context: 'status-update-error', configId });
    }

    // Ensure Sentry events are sent before function exits
    await flushSentry();
  }
};
