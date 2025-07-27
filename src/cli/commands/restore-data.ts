import { Command } from 'commander';
import { getConfig } from '../config';
import { confirmAction } from '../utils/confirm';
import { restoreData } from '../../lib/storageService';

async function actionRestoreData(options: { name: string; dryRun?: boolean; yes?: boolean }) {
    const { logger } = getConfig();

    logger.info(`Starting restore process from backup: ${options.name}`);
    if (options.dryRun) {
        logger.warn('--- DRY RUN MODE ---');
    }

    if (!options.dryRun && !options.yes) {
        const proceed = await confirmAction({
            title: 'Confirm Restore Operation',
            details: [
                `This is a destructive operation.`,
                `It will delete all current live evaluation data.`,
                `It will restore all data from the backup named: ${options.name}`
            ],
            warning: 'This action CANNOT be undone. An automatic backup of the current state will be attempted as a safety measure.'
        });
        
        if (!proceed) {
            logger.info('Restore operation cancelled by user.');
            return;
        }
    }

    try {
        await restoreData(options.name, options.dryRun || false, logger);
        if(options.dryRun) {
            logger.info('[DRY RUN] Restore simulation complete.');
        } else {
            logger.success(`Successfully restored data from backup '${options.name}'.`);
        }
    } catch (error: any) {
        logger.error(`Restore process failed: ${error.message}`);
        if(error.stack && process.env.DEBUG) {
            logger.error(error.stack);
        }
    }
}

export const restoreDataCommand = new Command('restore-data')
    .description('Restores all evaluation data from a specified backup. This is a destructive operation.')
    .requiredOption('--name <name>', 'The name of the backup to restore from.')
    .option('--dry-run', 'Log what would be restored without actually touching any files.')
    .option('--yes', 'Skip the confirmation prompt. Use with caution.')
    .action(actionRestoreData); 