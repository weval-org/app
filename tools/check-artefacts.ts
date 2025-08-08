#!/usr/bin/env tsx
/**
 * Quick diagnostics for a single run's artefacts.
 *
 * Usage:
 *   pnpm tsx tools/check-artefacts.ts <configId> <runLabel> <timestamp>
 *
 * Example:
 *   pnpm tsx tools/check-artefacts.ts banjul-charter 9786576e02d7f5d0 2025-06-26T06-11-26-273Z
 *
 * The script verifies the presence and basic validity of:
 *   • core.json
 *   • responses/<promptId>.json for every prompt
 *   • coverage/<promptId>/<modelId>.json for one sample prompt/model
 *
 * It exits with non-zero code if core.json is absent; otherwise prints warnings
 * for any missing or empty companion artefacts.
 */
import {
  artefactExists,
  getCoreResult,
  getPromptResponses,
  getCoverageResult,
} from '@/lib/storageService';

function usage() {
  console.error('Args: <configId> <runLabel> <timestamp>');
  process.exit(1);
}

const [configId, runLabel, timestamp] = process.argv.slice(2);
if (!configId || !runLabel || !timestamp) usage();

(async () => {
  const runBase = `${runLabel}_${timestamp}`;
  console.log(`\n🔍  Checking artefacts for ${configId}/${runBase}\n`);

  // 1. core.json
  const core = await getCoreResult(configId, runLabel, timestamp);
  if (!core) {
    console.error('❌ core.json NOT found (helper fell back to legacy file).');
    process.exit(2);
  }
  console.log(`✓ core.json ok – prompts=${core.promptIds.length}, models=${core.effectiveModels.length}`);

  // 2. responses per prompt
  for (const promptId of core.promptIds) {
    const exists = await artefactExists(configId, runBase, `responses/${promptId}.json`);
    if (!exists) {
      console.warn(`⚠️  responses/${promptId}.json missing`);
      continue;
    }
    const resp = await getPromptResponses(configId, runLabel, timestamp, promptId);
    if (!resp || Object.keys(resp).length === 0)
      console.warn(`⚠️  responses/${promptId}.json empty`);
  }

  // 3. sample coverage (first prompt + model)
  const samplePrompt = core.promptIds[0];
  const sampleModel = core.effectiveModels[0];
  if (samplePrompt && sampleModel) {
    const cov = await getCoverageResult(configId, runLabel, timestamp, samplePrompt, sampleModel);
    if (!cov) {
      console.warn(`⚠️  coverage/${samplePrompt}/${sampleModel}.json missing`);
    } else {
      console.log(`✓ coverage sample ok (avgCoverageExtent=${cov.avgCoverageExtent ?? 'n/a'})`);
    }
  }

  console.log('\n✅  Diagnostics complete.');
})();
