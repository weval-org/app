import { Command } from 'commander';
import { getConfig } from '@/cli/config';
import { buildMacroFlat } from '@/cli/services/macro-prep-service';

async function actionPrepMacro() {
    const { logger } = getConfig();
    const t0 = Date.now();
    try {
        await logger.info(`[prep-macro] Starting flat macro derivations...`);
        await buildMacroFlat();
        await logger.success(`[prep-macro] Done in ${Date.now() - t0}ms.`);
    } catch (err: any) {
        await logger.error(`[prep-macro] Failed: ${err.message}`);
        if (process.env.DEBUG && err.stack) {
            await logger.error(err.stack);
        }
        process.exit(1);
    }
}

export const prepMacroCommand = new Command('prep-macro')
    .description('Prepare and save macro artefacts and headline metrics (flat, latest runs only)')
    .action(actionPrepMacro);


