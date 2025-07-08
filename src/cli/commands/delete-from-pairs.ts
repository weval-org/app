import { Command } from 'commander';
import { getConfig } from '../config';
import { deletePairwiseTasks } from '../services/pairwise-task-queue-service';
import { confirmAction } from '../utils/confirm';

async function actionDeleteFromPairs(options: { configId?: string, siteId?: string }) {
    const { logger } = getConfig();
    const { configId, siteId } = options;

    const isConfirmed = await confirmAction({
        title: 'Confirm Deletion',
        details: configId
            ? [`You are about to delete all pairs tasks associated with config ID: ${configId}`]
            : ['You are about to delete ALL pairs tasks from the entire system.'],
        warning: 'This action is irreversible.'
    });

    if (!isConfirmed) {
        logger.info('Operation cancelled by user.');
        return;
    }

    try {
        logger.info('Proceeding with deletion...');
        const { deletedCount } = await deletePairwiseTasks({ configId, logger, siteId });
        logger.info(`Operation complete. Deleted ${deletedCount} tasks.`);
    } catch (error: any) {
        logger.error(`An error occurred during deletion: ${error.message}`);
        if (error.stack) {
            logger.error(error.stack);
        }
        process.exit(1);
    }
}

export const deleteFromPairsCommand = new Command('delete-from-pairs')
    .description('Deletes tasks from the pairwise comparison queue.')
    .option('-c, --config-id <id>', 'The configuration ID to delete tasks for. If omitted, ALL tasks will be deleted.')
    .option('-s, --site-id <siteId>', 'Optional Netlify site ID to use for blob storage.')
    .action(actionDeleteFromPairs); 