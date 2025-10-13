import { Command } from 'commander';
import { listConfigIds, listRunsForConfig, artefactExists, getPromptResponses } from '@/lib/storageService';
import { getConfig } from '../config';
import { getStorageContext } from '@/lib/storageService';
import path from 'path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';

interface BackfillOptions {
  dryRun?: boolean;
  verbose?: boolean;
  latestOnly?: boolean;
  force?: boolean;
  config?: string;
  runLabel?: string;
  timestamp?: string;
  skipSandbox?: boolean;
  skipTags?: string;  // Comma-separated list of tags to skip
}

/**
 * Helper to write a single response artefact (matches logic from saveResult)
 */
async function writeResponseArtefact(
  configId: string,
  runBase: string,
  promptId: string,
  modelId: string,
  responseText: string,
  dryRun: boolean,
  logger: any
): Promise<void> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR } = getStorageContext();

  // Safe model ID (same logic as in saveResult)
  const getSafeModelId = (id: string) => id.replace(/[:/\\?#%\[\]]/g, '_');
  const safeModelId = getSafeModelId(modelId);

  const relativePath = path.join('responses', promptId, `${safeModelId}.json`);
  const s3Key = path.join('live', 'blueprints', configId, runBase, relativePath);
  const localPath = path.join(RESULTS_DIR, s3Key);

  if (dryRun) {
    logger.info(`[DRY RUN] Would write: ${s3Key}`);
    return;
  }

  const jsonData = JSON.stringify(responseText);

  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({
      Bucket: s3BucketName,
      Key: s3Key,
      Body: jsonData,
      ContentType: 'application/json',
    }));
  } else if (storageProvider === 'local') {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, jsonData, 'utf-8');
  }
}

export const backfillGranularResponsesCommand = new Command('backfill-granular-responses')
  .description('Backfills individual response artefacts (responses/{promptId}/{modelId}.json) for runs that only have bulk files')
  .allowExcessArguments(false)
  .option('--dry-run', 'Scan and report, but do not write any artefacts')
  .option('--verbose', 'Verbose logging')
  .option('--config <id>', 'Backfill only this configId')
  .option('--run-label <label>', 'When --config provided, backfill only this runLabel (requires --timestamp)')
  .option('--timestamp <ts>', 'ISO timestamp of the run to backfill (with --run-label)')
  .option('--latest-only', 'Only backfill the latest run per config')
  .option('--force', 'Rewrite artefacts even if they already exist')
  .option('--skip-sandbox', 'Skip sandbox runs (configIds starting with "sandbox-")')
  .option('--skip-tags <tags>', 'Skip runs with these tags (comma-separated, e.g., "test,demo,wip")')
  .action(async (opts: BackfillOptions) => {
    const { logger } = getConfig();
    const { dryRun, verbose, latestOnly, force, config: onlyConfig, runLabel: onlyRunLabel, timestamp: onlyTimestamp, skipSandbox, skipTags } = opts;

    const log = (msg: string) => verbose ? logger.info(msg) : null;

    // Parse skip tags
    const tagsToSkip = skipTags ? skipTags.split(',').map(t => t.trim().toLowerCase()) : [];

    try {
      let configs = await listConfigIds();
      if (onlyConfig) configs = configs.filter(c => c === onlyConfig);

      // Filter out sandbox configs if requested
      if (skipSandbox) {
        const beforeCount = configs.length;
        configs = configs.filter(c => !c.startsWith('sandbox-'));
        const filtered = beforeCount - configs.length;
        if (filtered > 0) {
          logger.info(`Filtered out ${filtered} sandbox config(s)`);
        }
      }

      // Filter out workshop runs (always - they have a different storage structure without granular responses)
      const beforeWorkshop = configs.length;
      configs = configs.filter(c => !c.startsWith('workshop_'));
      const workshopFiltered = beforeWorkshop - configs.length;
      if (workshopFiltered > 0) {
        logger.info(`Filtered out ${workshopFiltered} workshop config(s) (different storage structure)`);
      }

      // Filter out story quick runs (always - they don't use granular response structure)
      const beforeStory = configs.length;
      configs = configs.filter(c => !c.startsWith('story-quickrun-'));
      const storyFiltered = beforeStory - configs.length;
      if (storyFiltered > 0) {
        logger.info(`Filtered out ${storyFiltered} story quick run config(s) (different storage structure)`);
      }

      if (configs.length === 0) {
        logger.warn('No matching configs found');
        return;
      }
      logger.info(`Found ${configs.length} config(s) to process.`);

      let totalFilesWritten = 0;
      let totalSkipped = 0;

      for (const configId of configs) {
        const runs = await listRunsForConfig(configId);

        let runsToProcess = runs;
        if (onlyRunLabel && onlyTimestamp) {
          runsToProcess = runs.filter(r => r.runLabel === onlyRunLabel && r.timestamp === onlyTimestamp);
        } else if (latestOnly) {
          runsToProcess = runs[0] ? [runs[0]] : [];
        }

        logger.info(`Processing ${runsToProcess.length} run(s) for config ${configId}`);

        const ora = (await import('ora')).default;
        for (const run of runsToProcess) {
          const { runLabel, timestamp } = run;

          // Skip runs with null timestamp (invalid data)
          if (!timestamp) {
            log(`Skipping ${configId}/${runLabel} - no timestamp`);
            totalSkipped++;
            continue;
          }

          const identifier = `${configId}/${runLabel}/${timestamp}`;
          const runBase = `${runLabel}_${timestamp}`;

          // Check tags first (before dry-run check) so filtering works in dry-run mode too
          if (tagsToSkip.length > 0) {
            try {
              const { storageProvider, s3Client, s3BucketName, RESULTS_DIR } = getStorageContext();
              const coreKey = path.join('live', 'blueprints', configId, runBase, 'core.json');
              const coreLocalPath = path.join(RESULTS_DIR, coreKey);

              let coreData: any = null;
              if (storageProvider === 's3' && s3Client && s3BucketName) {
                const { GetObjectCommand } = await import('@aws-sdk/client-s3');
                const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: coreKey }));
                if (Body) {
                  const streamToString = (stream: any): Promise<string> => {
                    const chunks: any[] = [];
                    return new Promise((resolve, reject) => {
                      stream.on('data', (chunk: any) => chunks.push(chunk));
                      stream.on('error', reject);
                      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
                    });
                  };
                  const str = await streamToString(Body as any);
                  coreData = JSON.parse(str);
                }
              } else {
                const content = await fs.readFile(coreLocalPath, 'utf-8');
                coreData = JSON.parse(content);
              }

              if (coreData?.config?.tags) {
                const runTags = Array.isArray(coreData.config.tags)
                  ? coreData.config.tags.map((t: string) => t.toLowerCase())
                  : [];
                const hasSkipTag = runTags.some((tag: string) => tagsToSkip.includes(tag));
                if (hasSkipTag) {
                  const matchedTags = runTags.filter((t: string) => tagsToSkip.includes(t)).join(', ');
                  if (dryRun) {
                    logger.info(`[DRY RUN] Would skip ${identifier} - has excluded tag(s): ${matchedTags}`);
                  } else {
                    log(`Skipping ${identifier} - has excluded tag(s): ${matchedTags}`);
                  }
                  totalSkipped++;
                  continue;
                }
              }
            } catch (e) {
              // If we can't read tags, continue processing (don't skip based on tag filter)
              log(`Could not read tags for ${identifier}, continuing without tag filter`);
            }
          }

          if (dryRun) {
            logger.info(`[DRY RUN] Would process ${identifier}`);
            continue;
          }

          const spinner = ora(`Backfilling granular responses for ${identifier} …`).start();
          const startTs = Date.now();
          const heartbeat = setInterval(() => {
            const secs = Math.round((Date.now() - startTs) / 1000);
            spinner.text = `Backfilling ${identifier} … (${secs}s)`;
          }, 5000);

          try {
            // We need to read the bulk response files for each prompt
            // Unfortunately we don't have a list of promptIds readily available without reading core.json or legacy file
            // Let's try reading core.json first to get promptIds
            const { storageProvider, s3Client, s3BucketName, RESULTS_DIR, streamToString } = getStorageContext();
            const coreKey = path.join('live', 'blueprints', configId, runBase, 'core.json');
            const coreLocalPath = path.join(RESULTS_DIR, coreKey);

            let promptIds: string[] = [];

            // Try to get promptIds from core.json
            try {
              let coreData: any = null;
              if (storageProvider === 's3' && s3Client && s3BucketName) {
                const { GetObjectCommand } = await import('@aws-sdk/client-s3');
                const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: coreKey }));
                if (Body) {
                  const { Readable } = await import('stream');
                  const streamToString = (stream: any): Promise<string> => {
                    const chunks: any[] = [];
                    return new Promise((resolve, reject) => {
                      stream.on('data', (chunk: any) => chunks.push(chunk));
                      stream.on('error', reject);
                      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
                    });
                  };
                  const str = await streamToString(Body as any);
                  coreData = JSON.parse(str);
                }
              } else {
                const content = await fs.readFile(coreLocalPath, 'utf-8');
                coreData = JSON.parse(content);
              }

              if (coreData?.promptIds) {
                promptIds = coreData.promptIds;
              }
            } catch (e) {
              log(`Could not read core.json for ${identifier}, will try to discover promptIds from responses/ directory`);
              // Fallback: list all files in responses/ directory
              // This is trickier with S3, so we'll skip this run if we can't get promptIds
              clearInterval(heartbeat);
              spinner.warn(`Skipped ${identifier} - could not determine promptIds`);
              totalSkipped++;
              continue;
            }

            if (promptIds.length === 0) {
              clearInterval(heartbeat);
              spinner.warn(`Skipped ${identifier} - no prompts found`);
              totalSkipped++;
              continue;
            }

            let filesWrittenForRun = 0;

            // Process prompts in parallel with concurrency limit
            const promptPromises = promptIds.map(async (promptId) => {
              // Fetch bulk responses for this prompt
              const responses = await getPromptResponses(configId, runLabel, timestamp, promptId);
              if (!responses) {
                log(`No responses found for prompt ${promptId} in ${identifier}`);
                return 0;
              }

              // Process all models for this prompt in parallel
              const modelPromises = Object.keys(responses).map(async (modelId) => {
                // Check if individual artefact already exists (unless force is set)
                if (!force) {
                  const getSafeModelId = (id: string) => id.replace(/[:/\\?#%\[\]]/g, '_');
                  const safeModelId = getSafeModelId(modelId);
                  const individualPath = path.join('responses', promptId, `${safeModelId}.json`);
                  const exists = await artefactExists(configId, runBase, individualPath);
                  if (exists) {
                    log(`Skipping ${promptId}/${modelId} - already exists`);
                    return 0;
                  }
                }

                // Write individual artefact
                await writeResponseArtefact(configId, runBase, promptId, modelId, responses[modelId], false, logger);
                return 1;
              });

              const results = await Promise.all(modelPromises);
              return results.reduce((sum: number, count) => sum + count, 0);
            });

            const promptResults = await Promise.all(promptPromises);
            filesWrittenForRun = promptResults.reduce((sum: number, count) => sum + count, 0);

            clearInterval(heartbeat);
            const secs = Math.round((Date.now() - startTs) / 1000);
            spinner.succeed(`Backfilled ${identifier} - wrote ${filesWrittenForRun} individual response files in ${secs}s`);
            totalFilesWritten += filesWrittenForRun;

          } catch (runErr: any) {
            clearInterval(heartbeat);
            spinner.fail(`Failed to backfill ${identifier}: ${runErr.message}`);
            if (verbose && runErr.stack) logger.error(runErr.stack);
          }
        }
      }

      logger.success(`Backfill completed: ${totalFilesWritten} files written, ${totalSkipped} runs skipped`);
    } catch (err: any) {
      logger.error(`Backfill failed: ${err.message}`);
      if (opts.verbose && err.stack) logger.error(err.stack);
      process.exit(1);
    }
  });
