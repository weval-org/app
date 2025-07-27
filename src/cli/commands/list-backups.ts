import { Command } from 'commander';
import { getConfig } from '../config';
import { listBackups } from '../../lib/storageService';

async function actionListBackups(options: {}) {
    const { logger } = getConfig();
    
    logger.info(`Fetching available backups...`);

    try {
        const backups = await listBackups();
        if (backups.length === 0) {
            logger.warn('No backups found.');
        } else {
            logger.info('Available backups:');
            backups.forEach(backup => logger.info(`  - ${backup}`));
        }
        logger.success('Finished listing backups.');
    } catch (error: any) {
        logger.error(`Failed to list backups: ${error.message}`);
    }
}

export const listBackupsCommand = new Command('list-backups')
    .description('Lists all available data backups.')
    .action(actionListBackups); 