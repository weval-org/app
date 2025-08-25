import { Command } from 'commander';
import { getConfig } from '@/cli/config';
import { buildMacroFlat } from '@/cli/services/macro-prep-service';

async function actionPrepMacroCanvas() {
    const { logger } = getConfig();
    const t0 = Date.now();
    try {
        await logger.info(`[prep-macro-canvas] Starting flat build...`);
        await buildMacroFlat();
        await logger.success(`[prep-macro-canvas] Done in ${Date.now() - t0}ms.`);
    } catch (err: any) {
        await logger.error(`[prep-macro-canvas] Failed: ${err.message}`);
        if (process.env.DEBUG && err.stack) {
            await logger.error(err.stack);
        }
        process.exit(1);
    }
}

export const prepMacroCanvasCommand = new Command('prep-macro-canvas')
    .description('Prepare and save macro canvas artefacts (flat, latest runs only) to storage')
    .action(actionPrepMacroCanvas);


