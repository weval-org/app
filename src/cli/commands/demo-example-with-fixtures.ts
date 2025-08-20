import { Command } from 'commander';
import path from 'path';
import { getConfig } from '../config';
import { loadAndValidateConfig } from './run-config';
import { executeComparisonPipeline } from '../services/comparison-pipeline-service';
import { generateConfigContentHash } from '@/lib/hash-utils';
import { loadFixturesFromLocal, FixtureSet } from '@/lib/fixtures-service';
import type { EvaluationMethod } from '../types/cli_types';

async function actionDemo(name: string) {
    const { logger } = getConfig();
    try {
        const configPath = path.resolve(`examples/blueprints/${name}.yml`);
        const fixturesPath = path.resolve(`examples/fixtures/${name}.json`);

        logger.info(`Demo with fixtures → blueprint: ${configPath}`);
        logger.info(`Demo with fixtures → fixtures:  ${fixturesPath}`);

        const config = await loadAndValidateConfig({
            configPath,
            isRemote: false,
        });

        // Load fixtures (optional, but demo expects them to exist)
        let fixturesCtx: { fixtures: FixtureSet; strict: boolean } | undefined;
        try {
            const fixtures = await loadFixturesFromLocal(fixturesPath, logger as any);
            if (fixtures) {
                fixturesCtx = { fixtures, strict: false };
                logger.info(`Loaded fixtures successfully.`);
            } else {
                logger.warn(`Fixtures not found at ${fixturesPath}. Proceeding without fixtures.`);
            }
        } catch (e: any) {
            logger.warn(`Failed to load fixtures: ${e.message}. Proceeding without fixtures.`);
        }

        // Force-only llm-coverage and skip exec summary
        const evalMethods: EvaluationMethod[] = ['llm-coverage'];
        const runLabel = generateConfigContentHash(config);

        const result = await executeComparisonPipeline(
            { ...config, models: config.models.map(m => typeof m === 'string' ? m : m.id) },
            runLabel,
            evalMethods,
            logger,
            undefined,
            undefined,
            false, // cache
            undefined,
            configPath,
            false, // requireExecutiveSummary
            true,  // skipExecutiveSummary
            undefined,
            undefined,
            fixturesCtx,
            true,  // noSave (demo)
        );

        const payload = {
            configId: result.data.configId,
            configTitle: result.data.configTitle,
            runLabel: result.data.runLabel,
            timestamp: result.data.timestamp,
            evalMethodsUsed: result.data.evalMethodsUsed,
            promptIds: result.data.promptIds,
            allFinalAssistantResponses: result.data.allFinalAssistantResponses,
            evaluationResults: result.data.evaluationResults,
            errors: result.data.errors,
        };
        process.stdout.write(JSON.stringify(payload) + '\n');
    } catch (error: any) {
        const chalk = (await import('chalk')).default;
        console.error(chalk.red('\n✖ Error in demo-example-with-fixtures:'), chalk.white(error.message));
        if (process.env.DEBUG && error.stack) {
            console.error(chalk.gray('\nStack Trace:'), error.stack);
        }
        process.exit(1);
    }
}

export const demoExampleWithFixturesCommand = new Command('demo-example-with-fixtures')
    .description('Run an example blueprint from examples/ with its fixtures and print JSON to stdout (no saving).')
    .argument('<name>', 'Name of the example (corresponding to examples/blueprints/<name>.yml and examples/fixtures/<name>.json)')
    .action(actionDemo);


