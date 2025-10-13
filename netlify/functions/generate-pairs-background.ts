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
