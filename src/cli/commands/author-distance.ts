/**
 * CLI command for author distance analysis
 */

import { Command } from 'commander';
import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';
import { getConfig } from '../config';
import { runAuthorDistanceAnalysis } from '../experiments/author-distance-analysis';
import { AuthorPassage, AuthorDistanceAnalysisResult } from '../experiments/author-distance-types';

export const authorDistanceCommand = new Command('author-distance')
  .description('Compare model embedding distances to literary author distances')
  .requiredOption(
    '--passages <path>',
    'Path to JSON/JSONL file containing author passages',
  )
  .requiredOption(
    '--models <models>',
    'Comma-separated list of model IDs to compare (e.g., "openai:gpt-4o,anthropic:claude-3.5-sonnet")',
  )
  .option(
    '--embedding-model <model>',
    'Embedding model to use',
    'openai:text-embedding-3-small',
  )
  .option(
    '--extractor-model <model>',
    'LLM to use for prompt extraction',
    'openai:gpt-4o-mini',
  )
  .option(
    '--samples <number>',
    'Number of samples per prompt to average',
    (val) => parseInt(val, 10),
    3,
  )
  .option(
    '--temperature <number>',
    'Temperature for model responses',
    (val) => parseFloat(val),
    0.7,
  )
  .option(
    '--output <path>',
    'Output path for analysis results (JSON)',
    './author-distance-results.json',
  )
  .action(actionAuthorDistance);

async function actionAuthorDistance(options: {
  passages: string;
  models: string;
  embeddingModel: string;
  extractorModel: string;
  samples: number;
  temperature: number;
  output: string;
}) {
  const { logger } = getConfig();

  try {
    // Load passages
    logger.info(`Loading passages from ${options.passages}...`);
    const passagesPath = resolve(process.cwd(), options.passages);
    const passagesContent = await readFile(passagesPath, 'utf-8');

    let passages: AuthorPassage[];

    // Support both JSON and JSONL formats
    if (passagesContent.trim().startsWith('[')) {
      // JSON array format
      passages = JSON.parse(passagesContent);
    } else {
      // JSONL format (one JSON object per line)
      passages = passagesContent
        .trim()
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    }

    if (!passages || passages.length === 0) {
      throw new Error('No passages found in input file');
    }

    logger.info(`Loaded ${passages.length} passages from ${[...new Set(passages.map(p => p.author))].length} authors`);

    // Parse models
    const candidateModels = options.models.split(',').map(m => m.trim());
    logger.info(`Will compare ${candidateModels.length} models: ${candidateModels.join(', ')}`);

    // Run analysis
    const result: AuthorDistanceAnalysisResult = await runAuthorDistanceAnalysis(
      passages,
      candidateModels,
      {
        embeddingModel: options.embeddingModel,
        extractorModel: options.extractorModel,
        samplesPerPrompt: options.samples,
        temperature: options.temperature,
      },
    );

    // Save results
    const outputPath = resolve(process.cwd(), options.output);
    await writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8');

    logger.success(`\n${'='.repeat(80)}`);
    logger.success(`ANALYSIS COMPLETE`);
    logger.success(`${'='.repeat(80)}`);
    logger.info(`\nResults saved to: ${outputPath}`);

    // Print summary
    logger.info(`\n📊 SUMMARY:\n`);

    for (const item of result.interpretation.closestAuthorPairs) {
      logger.info(
        `  ${item.modelPair[0]} ↔ ${item.modelPair[1]}:\n` +
        `    Model distance: ${item.distance.toFixed(4)}\n` +
        `    ≈ ${item.closestAuthorPair[0]} ↔ ${item.closestAuthorPair[1]}\n` +
        `    Author distance: ${item.authorDistance.toFixed(4)}\n` +
        `    Difference: ${item.percentageDifference.toFixed(1)}%\n`,
      );
    }

    logger.info(`\n✨ Analysis complete! View full results at ${outputPath}`);
  } catch (error: any) {
    logger.error(`Analysis failed: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}
