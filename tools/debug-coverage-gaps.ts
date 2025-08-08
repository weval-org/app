#!/usr/bin/env tsx
/* eslint-disable no-console */
import pLimit from '@/lib/pLimit';
import { getCoreResult, getPromptResponses, getCoverageResult } from '@/lib/storageService';

interface GapStats {
  missingResponses: Record<string, string[]>; // prompt -> models
  missingCoverage: Record<string, string[]>; // prompt -> models
}

async function main() {
  const [configId, runLabel, timestamp] = process.argv.slice(2);
  if (!timestamp) {
    console.error('Usage: pnpm tsx tools/debug-coverage-gaps.ts <configId> <runLabel> <timestamp>');
    process.exit(1);
  }

  const core = await getCoreResult(configId, runLabel, timestamp);
  if (!core) {
    console.error('❌ core.json not found (or legacy file missing)');
    process.exit(2);
  }

  const prompts: string[] = core.promptIds || [];
  const models: string[] = core.effectiveModels || [];
  const gapStats: GapStats = { missingResponses: {}, missingCoverage: {} };

  console.log(`Checking ${prompts.length} prompts × ${models.length} models …`);

  // limit concurrent S3 calls to 16
  const limit = pLimit(16);

  await Promise.all(
    prompts.map(async (promptId, pi) => {
      if (pi % 5 === 0) console.log(`… prompt ${pi + 1}/${prompts.length}`);

      // responses per prompt
      const resp = await getPromptResponses(configId, runLabel, timestamp, promptId);
      if (!resp) gapStats.missingResponses[promptId] = models.slice();
      else {
        models.forEach(m => {
          if (resp[m] === undefined) {
            (gapStats.missingResponses[promptId] ||= []).push(m);
          }
        });
      }

      // coverage per model (parallel with limit)
      await Promise.all(
        models.map(m => limit(async () => {
          const cov = await getCoverageResult(configId, runLabel, timestamp, promptId, m);
          if (!cov) {
            (gapStats.missingCoverage[promptId] ||= []).push(m);
          }
        }))
      );
    })
  );

  console.log('\n--- Missing Responses ---');
  for (const [p, arr] of Object.entries(gapStats.missingResponses)) {
    if (arr.length) console.log(`${p}: ${arr.length}`);
  }

  console.log('\n--- Missing Coverage ---');
  for (const [p, arr] of Object.entries(gapStats.missingCoverage)) {
    if (arr.length) console.log(`${p}: ${arr.length}`);
  }

  console.log('\nDone.');
}

main();