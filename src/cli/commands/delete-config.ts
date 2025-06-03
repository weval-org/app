import { Command } from 'commander';
import { getConfig } from '../config';
import { deleteConfigData, removeConfigFromHomepageSummary } from '../../lib/storageService';
import inquirer from 'inquirer';

async function action(configId: string, options: { yes?: boolean }) {
    const { logger } = getConfig();
    logger.info(`Attempting to delete all data and manifest entries for config ID: ${configId}`);

    if (!options.yes) {
        const answers = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirmDelete',
                message: `Are you sure you want to delete all data (S3 objects/local files) and remove entries from the homepage summary for config ID '${configId}'? This action cannot be undone.`,
                default: false,
            },
        ]);
        if (!answers.confirmDelete) {
            logger.info('Deletion cancelled by user.');
            return;
        }
    }

    logger.info(`Proceeding with deletion for config ID: ${configId}`);

    try {
        // Step 1: Delete all associated data (S3 objects or local files)
        logger.info(`Deleting data for config ID '${configId}' from storage...`);
        const filesDeleted = await deleteConfigData(configId);

        if (filesDeleted === -1) {
            logger.error(`An error occurred while trying to delete data for config ID '${configId}'. Check previous logs for details.`);
            // Optionally, decide if you want to stop or try to update the manifest anyway.
            // For safety, stopping here might be better.
            return;
        } else {
            logger.success(`Successfully deleted ${filesDeleted} files/objects for config ID '${configId}'.`);
        }

        // Step 2: Remove the config from the homepage summary manifest
        logger.info(`Removing config ID '${configId}' from the homepage summary manifest...`);
        const manifestUpdated = await removeConfigFromHomepageSummary(configId);

        if (manifestUpdated) {
            logger.success(`Homepage summary manifest updated successfully (or config ID was not present).`);
        } else {
            logger.error(`Failed to update the homepage summary manifest for config ID '${configId}'.`);
        }

        logger.success(`Deletion process completed for config ID: ${configId}.`);

    } catch (error: any) {
        logger.error(`An unexpected error occurred during the deletion process for config ID '${configId}': ${error.message}`);
        if (process.env.DEBUG && error.stack) {
            logger.error(`Stack trace: ${error.stack}`);
        }
        // Ensure process exits with an error code if something fails catastrophically
        process.exitCode = 1; 
    }
}

export const deleteConfigCommand = new Command('delete-config')
    .description('Deletes all data and manifest entries for a specific config ID. This includes S3 objects/local files and homepage summary updates.')
    .requiredOption('--config-id <id>', 'The config ID to delete.')
    .option('-y, --yes', 'Skip confirmation prompt.')
    .action(async (options) => {
        // Commander passes options as the first argument if no direct arguments are defined before options.
        // If direct arguments were defined (e.g. .argument('<id>', ...)), then options would be the second argument.
        // Here, config-id is an option, so it will be in options.configId
        await action(options.configId, options);
    }); 