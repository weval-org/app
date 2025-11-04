/**
 * PR Evaluation Limiter
 *
 * Enforces limits on PR evaluations to control costs and prevent abuse.
 * PR evals are for validation/staging - production evals have no limits.
 */

import { ComparisonConfig } from '@/cli/types/cli_types';
import { CustomModelDefinition } from '@/lib/llm-clients/types';
import axios from 'axios';
import { BLUEPRINT_CONFIG_REPO_SLUG } from '@/lib/configConstants';

/**
 * Limits for PR evaluations
 * These are HARDCODED policy decisions
 */
export interface PREvalLimits {
  // Model restrictions
  allowedModelCollections: string[];  // e.g., ['CORE', 'SMALL']
  maxModels: number;  // Max models to run, even from allowed collections

  // Content limits
  maxPrompts: number;  // Max number of prompts
  maxTemperatures: number;  // Max number of temperature variations
  maxSystemPrompts: number;  // Max number of system prompt variations

  // Total response cap (most important)
  maxTotalResponses: number;  // prompts × models × temps × systems
}

/**
 * PR Evaluation Limits - HARDCODED
 *
 * To change these limits, modify the values below and redeploy.
 * These limits only apply to PR staging evaluations.
 * Production evaluations (after merge) have NO LIMITS.
 */
export const PR_EVAL_LIMITS: PREvalLimits = {
  allowedModelCollections: ['CORE'],  // Only CORE models
  maxModels: 5,  // Max 5 models
  maxPrompts: 10,  // Max 10 prompts
  maxTemperatures: 2,  // Max 2 temperature values
  maxSystemPrompts: 2,  // Max 2 system prompts
  maxTotalResponses: 100,  // Hard cap: 100 total responses
};

/**
 * Violation details
 */
export interface LimitViolation {
  limit: string;
  current: number;
  max: number;
  message: string;
}

/**
 * Result of limit check
 */
export interface LimitCheckResult {
  allowed: boolean;
  violations: LimitViolation[];
  estimatedResponses: number;
  resolvedModelIds?: string[];
}

/**
 * Fetch model collection from GitHub
 */
async function fetchModelCollection(
  collectionName: string,
  githubToken?: string
): Promise<string[]> {
  const apiHeaders: Record<string, string> = {
    'Accept': 'application/vnd.github.v3.raw'
  };

  if (githubToken) {
    apiHeaders['Authorization'] = `token ${githubToken}`;
  }

  const url = `https://api.github.com/repos/${BLUEPRINT_CONFIG_REPO_SLUG}/contents/models/${collectionName}.json`;

  try {
    const response = await axios.get(url, { headers: apiHeaders });
    const models = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    return Array.isArray(models) ? models : [];
  } catch (error: any) {
    console.error(`Failed to fetch model collection ${collectionName}:`, error.message);
    return [];
  }
}

/**
 * Resolve models in blueprint, respecting PR eval limits
 */
async function resolveModels(
  configModels: any[],
  allowedCollections: string[],
  githubToken?: string
): Promise<{ modelIds: string[]; collectionViolations: string[] }> {
  const resolvedModelIds: string[] = [];
  const collectionViolations: string[] = [];

  for (const modelEntry of configModels) {
    // Custom model definitions are allowed
    if (typeof modelEntry === 'object' && modelEntry.id) {
      resolvedModelIds.push(modelEntry.id);
      continue;
    }

    // String model IDs
    if (typeof modelEntry === 'string') {
      // Check if it's a collection reference (uppercase, no colon)
      const isCollection = modelEntry === modelEntry.toUpperCase() && !modelEntry.includes(':');

      if (isCollection) {
        // Check if collection is allowed
        if (!allowedCollections.includes(modelEntry)) {
          collectionViolations.push(modelEntry);
          continue;
        }

        // Fetch and expand collection
        const collectionModels = await fetchModelCollection(modelEntry, githubToken);
        resolvedModelIds.push(...collectionModels);
      } else {
        // Direct model ID - allow it
        resolvedModelIds.push(modelEntry);
      }
    }
  }

  return { modelIds: resolvedModelIds, collectionViolations };
}

/**
 * Check if a blueprint meets PR evaluation limits
 */
export async function checkPREvalLimits(
  config: ComparisonConfig,
  githubToken?: string
): Promise<LimitCheckResult> {
  const limits = PR_EVAL_LIMITS;
  const violations: LimitViolation[] = [];

  // 1. Check prompts count
  const promptCount = config.prompts?.length || 0;
  if (promptCount > limits.maxPrompts) {
    violations.push({
      limit: 'prompts',
      current: promptCount,
      max: limits.maxPrompts,
      message: `Blueprint has ${promptCount} prompts, but PR evaluations are limited to ${limits.maxPrompts}`,
    });
  }

  // 2. Check temperatures
  const temperatures = config.temperatures || [undefined];
  const tempCount = temperatures.length;
  if (tempCount > limits.maxTemperatures) {
    violations.push({
      limit: 'temperatures',
      current: tempCount,
      max: limits.maxTemperatures,
      message: `Blueprint has ${tempCount} temperature values, but PR evaluations are limited to ${limits.maxTemperatures}`,
    });
  }

  // 3. Check system prompts
  const systems = config.systems || [config.system || undefined];
  const systemCount = systems.filter(s => s !== undefined).length || 1;
  if (systemCount > limits.maxSystemPrompts) {
    violations.push({
      limit: 'systems',
      current: systemCount,
      max: limits.maxSystemPrompts,
      message: `Blueprint has ${systemCount} system prompt variations, but PR evaluations are limited to ${limits.maxSystemPrompts}`,
    });
  }

  // 4. Resolve and check models
  const configModels = config.models || [];
  const { modelIds, collectionViolations } = await resolveModels(
    configModels,
    limits.allowedModelCollections,
    githubToken
  );

  // Check for disallowed collections
  if (collectionViolations.length > 0) {
    violations.push({
      limit: 'model_collections',
      current: collectionViolations.length,
      max: 0,
      message: `Blueprint uses disallowed model collections: ${collectionViolations.join(', ')}. PR evaluations only allow: ${limits.allowedModelCollections.join(', ')}`,
    });
  }

  // Check model count
  const modelCount = modelIds.length;
  if (modelCount > limits.maxModels) {
    violations.push({
      limit: 'models',
      current: modelCount,
      max: limits.maxModels,
      message: `Blueprint resolves to ${modelCount} models, but PR evaluations are limited to ${limits.maxModels}`,
    });
  }

  // 5. Calculate total responses
  // Use UNCAPPED values to show true cost of blueprint
  const estimatedResponses = promptCount * modelCount * tempCount * systemCount;

  // Also calculate what it would be if we cap individual dimensions
  const cappedPrompts = Math.min(promptCount, limits.maxPrompts);
  const cappedModels = Math.min(modelCount, limits.maxModels);
  const cappedTemps = Math.min(tempCount, limits.maxTemperatures);
  const cappedSystems = Math.min(systemCount, limits.maxSystemPrompts);

  if (estimatedResponses > limits.maxTotalResponses) {
    violations.push({
      limit: 'total_responses',
      current: estimatedResponses,
      max: limits.maxTotalResponses,
      message: `Blueprint would generate ~${estimatedResponses} responses (${promptCount} prompts × ${modelCount} models × ${tempCount} temps × ${systemCount} systems), but PR evaluations are limited to ${limits.maxTotalResponses} total responses`,
    });
  }

  return {
    allowed: violations.length === 0,
    violations,
    estimatedResponses,
    resolvedModelIds: modelIds,
  };
}

/**
 * Apply limits to a blueprint by trimming/filtering
 * Returns a modified config that fits within limits
 *
 * NOTE: This is for auto-fixing. You may want to reject instead.
 */
export async function applyPREvalLimits(
  config: ComparisonConfig,
  githubToken?: string
): Promise<ComparisonConfig> {
  const limits = PR_EVAL_LIMITS;
  const modifiedConfig = { ...config };

  // Trim prompts
  if (modifiedConfig.prompts && modifiedConfig.prompts.length > limits.maxPrompts) {
    modifiedConfig.prompts = modifiedConfig.prompts.slice(0, limits.maxPrompts);
  }

  // Trim temperatures
  if (modifiedConfig.temperatures && modifiedConfig.temperatures.length > limits.maxTemperatures) {
    modifiedConfig.temperatures = modifiedConfig.temperatures.slice(0, limits.maxTemperatures);
  }

  // Trim systems
  if (modifiedConfig.systems && modifiedConfig.systems.length > limits.maxSystemPrompts) {
    modifiedConfig.systems = modifiedConfig.systems.slice(0, limits.maxSystemPrompts);
  }

  // Filter models to allowed collections and limit count
  const configModels = modifiedConfig.models || [];
  const { modelIds } = await resolveModels(
    configModels,
    limits.allowedModelCollections,
    githubToken
  );

  // Limit to maxModels
  const limitedModelIds = modelIds.slice(0, limits.maxModels);
  modifiedConfig.models = limitedModelIds;

  return modifiedConfig;
}

/**
 * Generate a user-friendly error message for PR limit violations
 */
export function formatLimitViolations(violations: LimitViolation[]): string {
  const lines = [
    '❌ **Blueprint exceeds PR evaluation limits**\n',
    'PR evaluations are limited to control costs. Your blueprint exceeds the following limits:\n',
  ];

  for (const violation of violations) {
    lines.push(`- **${violation.message}**`);
  }

  lines.push('\n**PR Evaluation Limits:**');
  lines.push(`- Max prompts: ${PR_EVAL_LIMITS.maxPrompts}`);
  lines.push(`- Max models: ${PR_EVAL_LIMITS.maxModels}`);
  lines.push(`- Max temperatures: ${PR_EVAL_LIMITS.maxTemperatures}`);
  lines.push(`- Max system prompts: ${PR_EVAL_LIMITS.maxSystemPrompts}`);
  lines.push(`- Max total responses: ${PR_EVAL_LIMITS.maxTotalResponses}`);
  lines.push(`- Allowed model collections: ${PR_EVAL_LIMITS.allowedModelCollections.join(', ')}`);

  lines.push('\n**What happens:**');
  lines.push('- Your blueprint will be automatically trimmed to fit limits');
  lines.push('- PR evaluation runs with trimmed version for validation');
  lines.push('- After merge, full evaluation runs with all prompts/models/variations');
  lines.push('- You can also test locally: `pnpm cli run-config github --name your-blueprint`');

  return lines.join('\n');
}
