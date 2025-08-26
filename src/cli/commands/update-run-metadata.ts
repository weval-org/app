import { Command } from 'commander';
import { getConfig } from '../config';
import { getResultByFileName, saveResult, getConfigSummary, saveConfigSummary, updateSummaryDataWithNewRun } from '@/lib/storageService';
import { loadAndValidateConfig } from './run-config';
import { fetchBlueprintContentByName } from '@/lib/blueprint-service';
import type { SimpleLogger } from '@/lib/blueprint-service';
import { ComparisonConfig } from '../types/cli_types';

interface UpdateMetadataOptions {
  config?: string;
  updateSummaries?: boolean;
}

async function actionUpdateRunMetadata(runIdentifier: string, options: UpdateMetadataOptions) {
  const logger = getConfig().logger;

  // Parse run identifier
  const parts = runIdentifier.split('/');
  if (parts.length !== 3) {
    logger.error('Invalid runIdentifier format. Expected "configId/runLabel/timestamp".');
    process.exit(1);
    return;
  }
  const [configId, runLabel, timestamp] = parts;
  const fileName = `${runLabel}_${timestamp}_comparison.json`;

  logger.info(`Updating metadata for run: ${runIdentifier}`);

  // Load the existing run data
  const existingData: any = await getResultByFileName(configId, fileName);
  if (!existingData) {
    logger.error(`Could not find result file for identifier: ${runIdentifier}`);
    process.exit(1);
    return;
  }

  logger.info(`Found existing run data. Current config title: "${existingData.config?.title || existingData.configTitle || 'none'}"`);

  // Load the current blueprint to get updated metadata
  let updatedConfig: ComparisonConfig;
  if (!options.config) {
    // Try to load blueprint by name from GitHub
    logger.info(`No --config provided. Attempting to fetch blueprint '${configId}' from GitHub...`);
    const githubToken = process.env.GITHUB_TOKEN;
    const remote = await fetchBlueprintContentByName(configId, githubToken, logger as unknown as SimpleLogger).catch(() => null);
    if (remote) {
      updatedConfig = await loadAndValidateConfig({
        configContent: remote.content,
        blueprintPath: remote.blueprintPath,
        fileType: remote.fileType,
        isRemote: true,
      });
      logger.info(`Loaded blueprint '${configId}' from GitHub.`);
    } else {
      logger.error(`Blueprint '${configId}' not found on GitHub and no --config provided. Cannot update metadata.`);
      process.exit(1);
      return;
    }
  } else {
    // Load and validate the blueprint from local file
    updatedConfig = await loadAndValidateConfig({
      configPath: options.config,
      isRemote: false,
    });
    logger.info(`Loaded blueprint from local file: ${options.config}`);
  }

  // Log captured metadata for observability
  const title = updatedConfig.title || updatedConfig.configTitle;
  const description = updatedConfig.description;
  const author = (updatedConfig as any).author;
  const reference = (updatedConfig as any).reference;
  logger.info(`New blueprint metadata - Title: ${title ? `"${title}"` : 'none'}, Description: ${description ? `"${description.substring(0, 50)}${description.length > 50 ? '...' : ''}"` : 'none'}, Author: ${author ? (typeof author === 'string' ? `"${author}"` : `"${author.name}"${author.url ? ` (${author.url})` : ''}`) : 'none'}, Reference: ${reference ? (typeof reference === 'string' ? `"${reference}"` : `"${reference.title}"${reference.url ? ` (${reference.url})` : ''}`) : 'none'}`);

  // Update only the metadata fields in the existing run data
  const updatedData = {
    ...existingData,
    config: {
      ...existingData.config,
      title: title || existingData.config?.title,
      configTitle: title || existingData.config?.configTitle,
      description: description || existingData.config?.description,
      author: (updatedConfig as any).author || existingData.config?.author,
      reference: (updatedConfig as any).reference || existingData.config?.reference,
      tags: updatedConfig.tags || existingData.config?.tags,
    },
    configTitle: title || existingData.configTitle,
  };

  // Save the updated run data
  logger.info(`Saving updated run data to: ${fileName}`);
  await saveResult(configId, fileName, updatedData);

  // Update per-config summary if requested
  if (options.updateSummaries) {
    try {
      logger.info(`Updating per-config summary for ${configId}...`);
      const existingConfigSummary = await getConfigSummary(configId);
      const existingConfigsArray = existingConfigSummary ? [existingConfigSummary] : null;
      const updatedConfigs = updateSummaryDataWithNewRun(existingConfigsArray, updatedData as any, fileName);
      await saveConfigSummary(configId, updatedConfigs[0]);
      logger.info(`Successfully updated per-config summary for ${configId}.`);
    } catch (configSummaryError: any) {
      logger.error(`Failed to update per-config summary for ${configId}: ${configSummaryError.message}`);
    }
  } else {
    logger.info('Skipping summary update (use --update-summaries to enable).');
  }

  logger.info('✅ Run metadata update completed successfully.');
  
  // Show what changed
  const oldTitle = existingData.config?.title || existingData.configTitle || 'none';
  const newTitle = title || oldTitle;
  const oldAuthor = existingData.config?.author;
  const newAuthor = (updatedConfig as any).author || oldAuthor;
  const oldReference = existingData.config?.reference;
  const newReference = (updatedConfig as any).reference || oldReference;
  
  logger.info('--- Metadata Changes ---');
  logger.info(`Title: ${oldTitle !== newTitle ? `"${oldTitle}" → "${newTitle}"` : `"${newTitle}" (unchanged)`}`);
  logger.info(`Author: ${JSON.stringify(oldAuthor) !== JSON.stringify(newAuthor) ? `${JSON.stringify(oldAuthor)} → ${JSON.stringify(newAuthor)}` : `${JSON.stringify(newAuthor)} (unchanged)`}`);
  logger.info(`Reference: ${JSON.stringify(oldReference) !== JSON.stringify(newReference) ? `${JSON.stringify(oldReference)} → ${JSON.stringify(newReference)}` : `${JSON.stringify(newReference)} (unchanged)`}`);
}

export const updateRunMetadataCommand = new Command('update-run-metadata')
  .description('Update metadata (title, author, reference, tags) for an existing run from the current blueprint')
  .argument('<runIdentifier>', 'Run identifier in format "configId/runLabel/timestamp"')
  .option('--config <path>', 'Path to local blueprint file (if not provided, fetches from GitHub)')
  .option('--update-summaries', 'Update per-config summary file after metadata update')
  .action(actionUpdateRunMetadata);
