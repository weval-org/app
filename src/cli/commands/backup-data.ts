import { Command } from 'commander';
import { getConfig } from '../config';
import { toSafeTimestamp } from '../../lib/timestampUtils';
import { backupData } from '../../lib/storageService';

async function actionBackupData(options: { name?: string; dryRun?: boolean }) {
    const { logger } = getConfig();
    const backupName = options.name || `backup-${toSafeTimestamp(new Date().toISOString())}`;
    
    logger.info(`Starting backup process...`);
    logger.info(`Backup name: ${backupName}`);
    if (options.dryRun) {
        logger.warn('--- DRY RUN MODE ---');
    }

    try {
        const result = await backupData(backupName, options.dryRun || false, logger);
        if (options.dryRun) {
            logger.info(`[DRY RUN] Found ${result.fileCount} files to back up.`);
        } else {
            const sizeInMB = (result.totalSize / (1024 * 1024)).toFixed(2);
            logger.success(`Backup '${result.backupName}' created successfully.`);
            logger.info(`- Files backed up: ${result.fileCount}`);
            if (result.totalSize > 0) {
                 logger.info(`- Total size: ${sizeInMB} MB`);
            }
        }
    } catch (error: any) {
        logger.error(`Backup process failed: ${error.message}`);
        if(error.stack && process.env.DEBUG) {
            logger.error(error.stack);
        }
    }
}

export const backupDataCommand = new Command('backup-data')
    .description('Creates a complete backup of all evaluation data (runs and summaries).')
    .option('--name <name>', 'A specific name for the backup. If not provided, a timestamped name will be generated.')
    .option('--dry-run', 'Log what would be backed up without actually copying any files.')
    .action(actionBackupData); 