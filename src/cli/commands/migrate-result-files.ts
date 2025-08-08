import { Command } from 'commander';
import { listConfigIds, listRunsForConfig, artefactExists, getResultByFileName, saveResult } from '@/lib/storageService';
import { getConfig } from '../config';

interface MigrateOptions {
  dryRun?: boolean;
  verbose?: boolean;
  latestOnly?: boolean;
  force?: boolean;
  config?: string;
  runLabel?: string;
  timestamp?: string;
  deleteLegacy?: boolean; // not implemented yet – placeholder
}

export const migrateResultFilesCommand = new Command('migrate-result-files')
  .description('Backfills new artefact layout (core.json, responses/, coverage/) for legacy _comparison.json runs')
  .option('--dry-run', 'Scan and report, but do not write any artefacts')
  .option('--verbose', 'Verbose logging')
  .option('--config <id>', 'Migrate only this configId')
  .option('--run-label <label>', 'When --config provided, migrate only this runLabel (requires --timestamp)')
  .option('--timestamp <ts>', 'ISO timestamp of the run to migrate (with --run-label)')
  .option('--latest-only', 'Only migrate the latest run per config')
  .option('--force', 'Rewrite artefacts even if core.json already exists')
  .action(async (opts: MigrateOptions) => {
    const { logger } = getConfig();
    const { dryRun, verbose, latestOnly, force, config: onlyConfig, runLabel: onlyRunLabel, timestamp: onlyTimestamp } = opts;

    const log = (msg: string) => verbose ? logger.info(msg) : null;

    try {
      let configs = await listConfigIds();
      if (onlyConfig) configs = configs.filter(c => c === onlyConfig);
      if (configs.length === 0) {
        logger.warn('No matching configs found');
        return;
      }
      logger.info(`Found ${configs.length} config(s).`);

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
          const { runLabel, timestamp, fileName } = run;
          const identifier = `${configId}/${runLabel}/${timestamp}`;

          const runBase = `${runLabel}_${timestamp}`;
          const coreExists = await artefactExists(configId, runBase, 'core.json');
          if (coreExists && !force) {
            log(`✓ Artefacts already exist for ${identifier}`);
            continue;
          }

          if (dryRun) {
            logger.info(`[DRY] Would migrate ${identifier}`);
            continue;
          }

          const spinner = ora(`Migrating ${identifier} …`).start();
          const startTs = Date.now();
          const heartbeat = setInterval(() => {
            const secs = Math.round((Date.now() - startTs) / 1000);
            spinner.text = `Migrating ${identifier} … (${secs}s)`;
          }, 5000);

          try {
            const legacyData = await getResultByFileName(configId, fileName);
            if (!legacyData) {
              clearInterval(heartbeat);
              spinner.fail(`Legacy file missing for ${identifier}. Skipping.`);
              continue;
            }

            await saveResult(configId, fileName, legacyData);
            clearInterval(heartbeat);
            const secs = Math.round((Date.now() - startTs) / 1000);
            spinner.succeed(`Migrated ${identifier} in ${secs}s`);
          } catch (runErr: any) {
            clearInterval(heartbeat);
            spinner.fail(`Failed to migrate ${identifier}: ${runErr.message}`);
            if (verbose && runErr.stack) logger.error(runErr.stack);
          }
        }
      }

      logger.success('Migration completed');
    } catch (err: any) {
      logger.error(`Migration failed: ${err.message}`);
      if (verbose && err.stack) logger.error(err.stack);
      process.exit(1);
    }
  });
