import { saveJsonFile } from './storageService'; // Assuming saveJsonFile can handle S3 paths

type Status = 'pending' | 'running' | 'completed' | 'failed';

interface StatusFile {
    status: Status;
    lastUpdated: string;
    message?: string;
    payload?: Record<string, any>;
}

export function trackStatus(prefix: string, runId: string, logger: any) {
    const statusFilePath = `${prefix}/${runId}/status.json`;

    async function updateStatus(status: Status, message?: string, payload?: Record<string, any>) {
        const statusFile: StatusFile = {
            status,
            lastUpdated: new Date().toISOString(),
            ...(message && { message }),
            ...(payload && { payload }),
        };

        try {
            await saveJsonFile(statusFilePath, statusFile);
            logger.info(`Status for runId ${runId} updated to: ${status}`);
        } catch (error: any) {
            logger.error(`Failed to update status for runId ${runId} at ${statusFilePath}:`, error.message);
        }
    }

    return {
        running: () => updateStatus('running', 'Evaluation pipeline is in progress...'),
        completed: (payload: Record<string, any>) => updateStatus('completed', 'Evaluation completed successfully.', payload),
        failed: (payload: Record<string, any>) => updateStatus('failed', 'Evaluation failed.', payload),
        saveBlueprint: async (blueprint: any) => {
            const blueprintPath = `${prefix}/${runId}/blueprint.json`;
            try {
                await saveJsonFile(blueprintPath, blueprint);
                logger.info(`Blueprint for runId ${runId} saved to: ${blueprintPath}`);
            } catch (error: any) {
                logger.error(`Failed to save blueprint for runId ${runId} at ${blueprintPath}:`, error.message);
            }
        },
    };
}
