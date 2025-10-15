import type { BackgroundHandler } from '@netlify/functions';
import { getLogger } from '@/utils/logger';
import { listRunsForConfig, getResultByFileName } from '@/lib/storageService';
import { populatePairwiseQueue, updateGenerationStatus, GenerationStatus } from '@/cli/services/pairwise-task-queue-service';
import { ComparisonDataV2 as FetchedComparisonData } from '@/app/utils/types';

export const handler: BackgroundHandler = async (event, context) => {
  console.log('[generate-pairs-background] Function invoked');
  console.log('[generate-pairs-background] Event:', JSON.stringify(event, null, 2));
  console.log('[generate-pairs-background] Context:', JSON.stringify(context, null, 2));

  const body = event.body ? JSON.parse(event.body) : {};
  const { configId } = body;

  console.log('[generate-pairs-background] Parsed configId:', configId);

  const logger = await getLogger(`pairs:generate-bg:${configId || 'unknown'}`);
  logger.info('Background function started');

  if (!configId) {
    logger.error('Missing configId in invocation.');
    console.error('[generate-pairs-background] Missing configId in invocation body');
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
      }, { context });
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
      }, { context });
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
      }, { context });
      logger.error(`Could not fetch result data for file: ${latestRun.fileName}`);
      return;
    }

    // Update status with progress
    await updateGenerationStatus(configId, {
      status: 'generating',
      message: 'Generating comparison pairs...',
      timestamp: new Date().toISOString(),
    }, { context });

    // Generate the pairs
    const result = await populatePairwiseQueue(resultData, { logger, context });

    // Check if we failed due to missing anchor model
    if (result.anchorModelMissing) {
      await updateGenerationStatus(configId, {
        status: 'error',
        message: `Cannot generate pairs: evaluation results don't include the required anchor model 'openrouter:openai/gpt-4.1-mini'. Please run an evaluation that includes this model.`,
        timestamp: new Date().toISOString(),
        error: 'Missing anchor model',
      }, { context });
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
    }, { context });

    logger.info(`Successfully generated ${result.tasksAdded} pairs for config ${configId}.`);
    console.log('[generate-pairs-background] Success! Generated', result.tasksAdded, 'pairs');

  } catch (error: any) {
    console.error('[generate-pairs-background] FATAL ERROR:', error);
    console.error('[generate-pairs-background] Error message:', error.message);
    console.error('[generate-pairs-background] Error stack:', error.stack);
    logger.error(`Failed to generate pairs for config ${configId}: ${error.message}`);
    try {
      await updateGenerationStatus(configId, {
        status: 'error',
        message: 'An error occurred during pair generation.',
        timestamp: new Date().toISOString(),
        error: error.message,
      }, { context });
    } catch (statusUpdateError: any) {
      console.error('[generate-pairs-background] Failed to update error status:', statusUpdateError.message);
    }
  } finally {
    console.log('[generate-pairs-background] Function execution completed');
  }
};
