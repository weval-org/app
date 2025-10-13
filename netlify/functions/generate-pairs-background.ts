import type { BackgroundHandler } from '@netlify/functions';
import { getLogger } from '@/utils/logger';
import { listRunsForConfig, getResultByFileName } from '@/lib/storageService';
import { populatePairwiseQueue, updateGenerationStatus, GenerationStatus } from '@/cli/services/pairwise-task-queue-service';
import { ComparisonDataV2 as FetchedComparisonData } from '@/app/utils/types';

export const handler: BackgroundHandler = async (event) => {
  const body = event.body ? JSON.parse(event.body) : {};
  const { configId } = body;

  const logger = await getLogger(`pairs:generate-bg:${configId}`);

  if (!configId) {
    logger.error('Missing configId in invocation.');
    return;
  }

  // In development, background functions don't have proper Blobs access
  // This is a known limitation of netlify dev
  if (process.env.NODE_ENV === 'development' || !process.env.CONTEXT) {
    logger.error('Background functions are not fully supported in local development.');
    logger.error('Please run: netlify deploy --build && use the deployed version for testing pair generation.');

    // Try to update status to show error
    try {
      await updateGenerationStatus(configId, {
        status: 'error',
        message: 'Background functions require deployment to work properly. Please deploy to test this feature.',
        timestamp: new Date().toISOString(),
        error: 'Local development limitation',
      });
    } catch (e) {
      // Can't even update status - blobs not configured at all
      logger.error('Unable to update status - Netlify Blobs not configured in local dev');
    }
    return;
  }

  try {
    // Try to update status to 'generating'
    try {
      await updateGenerationStatus(configId, {
        status: 'generating',
        message: 'Fetching latest run for config...',
        timestamp: new Date().toISOString(),
      });
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
      });
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

    // Update status to complete
    await updateGenerationStatus(configId, {
      status: 'complete',
      message: `Successfully generated ${result.tasksAdded} new comparison pairs.`,
      timestamp: new Date().toISOString(),
      tasksGenerated: result.tasksAdded,
      totalTasksInQueue: result.totalTasksInQueue,
    });

    logger.info(`Successfully generated ${result.tasksAdded} pairs for config ${configId}.`);

  } catch (error: any) {
    logger.error(`Failed to generate pairs for config ${configId}: ${error.message}`);
    await updateGenerationStatus(configId, {
      status: 'error',
      message: 'An error occurred during pair generation.',
      timestamp: new Date().toISOString(),
      error: error.message,
    });
  }
};
