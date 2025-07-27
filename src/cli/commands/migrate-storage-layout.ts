import { Command } from 'commander';
import { getConfig } from '../config';
import { migrateDataToNewLayout } from '../../lib/storageService';

async function actionMigrateStorage(options: { dryRun?: boolean }) {
    const { logger } = getConfig();
    
    logger.info(`Starting storage migration process...`);
    if (options.dryRun) {
        logger.warn('--- DRY RUN MODE ---');
    }

    try {
        const result = await migrateDataToNewLayout(options.dryRun || false, logger);
        if (options.dryRun) {
            logger.info(`[DRY RUN] Found ${result.fileCount} files to migrate.`);
        } else {
            logger.success(`Migration complete. Copied ${result.fileCount} files to the new 'live/' directory structure.`);
        }
    } catch (error: any) {
        logger.error(`Migration process failed: ${error.message}`);
        if(error.stack && process.env.DEBUG) {
            logger.error(error.stack);
        }
    }
}

export const migrateStorageLayoutCommand = new Command('migrate-storage-layout')
    .description('A one-time command to copy data from the legacy directory structure to the new "live/" structure.')
    .option('--dry-run', 'Log what would be migrated without actually copying any files.')
    .action(actionMigrateStorage); 