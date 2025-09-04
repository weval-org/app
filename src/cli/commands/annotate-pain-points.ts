import { Command } from 'commander';
import crypto from 'crypto';
import pLimit from '@/lib/pLimit';
import { getConfig } from '../config';
import { getPainPointsSummary, getCoverageResult, saveRedlinesAnnotation, saveRedlinesFeed, saveConfigRedlinesFeed } from '@/lib/storageService';
import type { PainPoint, RedlinesAnnotation, WevalConfig } from '@/types/shared';
import { getModelResponse } from '@/cli/services/llm-service';
import { fetchBlueprintContentByName } from '@/lib/blueprint-service';
import { parseAndNormalizeBlueprint } from '@/lib/blueprint-parser';
import { SimpleLogger } from '@/lib/blueprint-service';

const configCache = new Map<string, WevalConfig>();

async function getBlueprintConfig(configId: string): Promise<WevalConfig | null> {
  const { logger } = getConfig();
  if (configCache.has(configId)) {
    return configCache.get(configId) || null;
  }

  try {
    const blueprintPath = configId.replace(/__/g, '/');
    const remote = await fetchBlueprintContentByName(blueprintPath, process.env.GITHUB_TOKEN, logger as unknown as SimpleLogger);
    if (remote) {
      const config = parseAndNormalizeBlueprint(remote.content, remote.fileType);
      configCache.set(configId, config);
      return config;
    }
  } catch (error: any) {
    logger.warn(`Could not fetch blueprint for configId "${configId}": ${error.message}`);
  }
  
  return null;
}

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function buildPrompt(point: PainPoint, rubricPoints: string[]): { system: string; user: string } {
  const system = `You are an expert evaluator. Your task is to analyze a candidate response against a rubric and identify all shortcomings. Provide feedback using XML-style annotations.

You must structure your response using two tags: <annotated_response> and <additional>.

<annotated_response>
[The candidate response with inline <issue point="..."> tags marking specific problems]
</annotated_response>

<additional>
[Any issues that cannot be tied to specific text spans, such as omissions]
<issue point="...">Description of an issue not tied to a specific span</issue>
</additional>

IMPORTANT GUIDELINES:
- Focus exclusively on deficits and problems. Do NOT provide praise or positive feedback.
- In the <annotated_response> section, include the *exact* original text. Only add <issue> tags where the text violates the rubric.
- The 'point' attribute in an <issue> tag should reference the specific rubric criteria being violated.
- For partial failures (e.g., mentioning one required item but omitting another), wrap the existing text in an <issue> tag.
- For complete omissions (e.g., failing to mention a required topic), add an <issue> tag in the <additional> section.
- If you have already marked an issue inline, DO NOT add a corresponding entry in the <additional> section.

---
EXAMPLE 1: Inline issue
---
RUBRIC:
1. The sky is blue.
2. The grass is green.

CANDIDATE: The sky is blue and the grass is usually purple.

RESPONSE:
<annotated_response>
The sky is blue and the grass is usually <issue point="2. The grass is green">purple</issue>.
</annotated_response>

<additional>
</additional>

---
EXAMPLE 2: Omission
---
RUBRIC:
1. Must mention Paris.
2. Must mention the Eiffel Tower.

CANDIDATE: The capital of France is Paris.

RESPONSE:
<annotated_response>
The capital of France is Paris.
</annotated_response>

<additional>
<issue point="2. Must mention the Eiffel Tower">The response fails to mention the Eiffel Tower, which was required</issue>
</additional>
---
`;

  const rubric = rubricPoints.map((p, i) => `${i + 1}. ${p}`).join('\n');

  const user = `BLUEPRINT PROMPT CONTEXT
---
${typeof point.promptContext === 'string' ? point.promptContext : (Array.isArray(point.promptContext) ? point.promptContext.map((m:any) => `${m.role.toUpperCase()}: ${m.content}`).join('\n') : '')}

RUBRIC POINTS
---
${rubric}

CANDIDATE RESPONSE (verbatim)
---
${point.responseText}`;
  return { system, user };
}

async function annotatePoint(point: PainPoint, rubricPoints: string[], modelId: string, temperature: number): Promise<RedlinesAnnotation> {
  const { logger } = getConfig();
  const respHash = sha256(`${point.configId}|${point.promptId}|${point.modelId}|${point.responseText}`);
  const { system, user } = buildPrompt(point, rubricPoints);

  const raw = await getModelResponse({ modelId, messages: [{ role: 'user', content: user }], systemPrompt: system, temperature });
  if (!raw) throw new Error('Empty annotation response');

  // Import the XML parser
  const { parseRedlinesXmlResponse, validateParsedAnnotation, extractAllIssues } = await import('../services/redlines-xml-parser');

  try {
    // Parse the XML response
    const parsed = parseRedlinesXmlResponse(raw);
    
    // Validate the parsed result
    const validation = validateParsedAnnotation(parsed);
    if (!validation.isValid) {
      throw new Error(`Invalid annotation format: ${validation.error}`);
    }

    const ann: RedlinesAnnotation = {
      configId: point.configId,
      runLabel: point.runLabel,
      timestamp: point.timestamp,
      promptId: point.promptId,
      modelId: point.modelId,
      responseHash: respHash,
      responseText: point.responseText,
      annotatedResponse: parsed.annotatedResponse,
      additionalIssues: parsed.additionalIssues,
      rubricPoints,
      llm: { modelId, temperature },
      createdAt: new Date().toISOString(),
    };
    
    await saveRedlinesAnnotation(ann);
    return ann;
  } catch (err: any) {
    logger.error(`Failed to parse LLM XML response. Raw output:\n${raw}`);
    throw new Error(`XML parsing failed: ${err.message}`);
  }
}

export async function actionAnnotatePainPoints(options: { min?: number; max?: number; minLen?: number; maxLen?: number; limit?: number; pluckFromConfigMax?: number; concurrency?: number; dryRun?: boolean; model?: string; temperature?: number; verbose?: boolean; ignoreTags?: string }) {
  const { logger } = getConfig();
  const min = options.min ?? 0.2;
  const max = options.max ?? 0.4;
  const minLen = options.minLen ?? 200;
  const maxLen = options.maxLen ?? 1000;
  const limit = options.limit ?? 50;
  const pluckFromConfigMax = options.pluckFromConfigMax ?? 10;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const modelId = options.model ?? 'openrouter:google/gemini-2.5-flash';
  const temperature = options.temperature ?? 0.1;
  const ignoreTags = new Set((options.ignoreTags || '').split(',').map(t => t.trim()).filter(Boolean));
  const defaultIgnoreTags = ['test'];

  const limiter = pLimit(concurrency);

  const summary = await getPainPointsSummary();
  if (!summary) {
    logger.warn('No pain points summary found. Run generate-pain-points first.');
    return;
  }

  // Pre-filter configs based on tags for better observability
  const allConfigIds = [...new Set(summary.painPoints.map(p => p.configId))];
  const ignoredConfigIds = new Set<string>();
  if (options.verbose) logger.info(`Found ${summary.painPoints.length} pain points across ${allConfigIds.length} unique configs. Checking tags...`);

  for (const configId of allConfigIds) {
    const config = await getBlueprintConfig(configId);
    const tags = config?.tags || [];
    const hasIgnoredTag = tags.some(tag => 
        (tag.startsWith('_')) ||
        (defaultIgnoreTags.includes(tag)) ||
        (ignoreTags.has(tag))
    );
    if (hasIgnoredTag) {
      ignoredConfigIds.add(configId);
      if (options.verbose) logger.info(`[v] IGNORE config: ${configId} (tags: ${tags.join(', ')})`);
    } else {
      if (options.verbose) logger.info(`[v] CONSIDER config: ${configId} (tags: ${tags.join(', ')})`);
    }
  }

  const candidates: PainPoint[] = [];
  let scanned = 0, excludedByTag = 0;
  let scoreBelow = 0, scoreAbove = 0, scoreInWindow = 0, lenTooShort = 0, lenTooLong = 0, lenEligible = 0;
  for (const p of summary.painPoints) {
    scanned += 1;

    if (ignoredConfigIds.has(p.configId)) {
      excludedByTag++;
      continue;
    }

    if (p.coverageScore == null) continue;
    const len = (p.responseText || '').length;
    if (p.coverageScore < min) {
      scoreBelow += 1;
      if (options.verbose) logger.info(`[v] EXCLUDE score-below: ${p.configId}/${p.promptId} ${p.modelId} score=${p.coverageScore.toFixed(3)} len=${len}`);
      continue;
    }
    if (p.coverageScore > max) {
      scoreAbove += 1;
      if (options.verbose) logger.info(`[v] EXCLUDE score-above: ${p.configId}/${p.promptId} ${p.modelId} score=${p.coverageScore.toFixed(3)} len=${len}`);
      continue;
    }
    scoreInWindow += 1;
    if (len < minLen) {
      lenTooShort += 1;
      if (options.verbose) logger.info(`[v] EXCLUDE short: ${p.configId}/${p.promptId} ${p.modelId} score=${p.coverageScore.toFixed(3)} len=${len}`);
      continue;
    }
    if (len > maxLen) {
      lenTooLong += 1;
      if (options.verbose) logger.info(`[v] EXCLUDE long: ${p.configId}/${p.promptId} ${p.modelId} score=${p.coverageScore.toFixed(3)} len=${len}`);
      continue;
    }
    lenEligible += 1;
    if (options.verbose) logger.info(`[v] INCLUDE: ${p.configId}/${p.promptId} ${p.modelId} score=${p.coverageScore.toFixed(3)} len=${len}`);
    candidates.push(p);
  }

  // Apply per-config limiting to ensure better distribution across configs
  const configGroups = new Map<string, PainPoint[]>();
  for (const candidate of candidates) {
    if (!configGroups.has(candidate.configId)) {
      configGroups.set(candidate.configId, []);
    }
    configGroups.get(candidate.configId)!.push(candidate);
  }

  // Sort each config's candidates by coverage score (worst first) and take at most pluckFromConfigMax
  const distributedCandidates: PainPoint[] = [];
  let configsLimited = 0;
  for (const [configId, configCandidates] of configGroups.entries()) {
    // Sort by coverage score ascending (worst first)
    const sortedConfigCandidates = configCandidates.sort((a, b) => (a.coverageScore || 0) - (b.coverageScore || 0));
    const selected = sortedConfigCandidates.slice(0, pluckFromConfigMax);
    distributedCandidates.push(...selected);
    
    if (configCandidates.length > pluckFromConfigMax) {
      configsLimited += 1;
      if (options.verbose) {
        logger.info(`[v] CONFIG LIMIT: ${configId} had ${configCandidates.length} candidates, taking worst ${pluckFromConfigMax}`);
      }
    }
  }

  // Sort the final distributed list by coverage score (worst first) and apply global limit
  const finalCandidates = distributedCandidates
    .sort((a, b) => (a.coverageScore || 0) - (b.coverageScore || 0))
    .slice(0, limit);

  const consideredConfigs = allConfigIds.length - ignoredConfigIds.size;
  logger.info(
    `Redlines selection: from ${consideredConfigs}/${allConfigIds.length} configs. Pain points: scanned=${scanned}, excludedByTag=${excludedByTag}. Score window: in=${scoreInWindow}, below=${scoreBelow}, above=${scoreAbove}. Length: eligible=${lenEligible}, short=${lenTooShort}, long=${lenTooLong}. Configs in selection=${configGroups.size} (limited: ${configsLimited}). Final candidates=${finalCandidates.length} (limit=${limit}, pluck=${pluckFromConfigMax})`
  );

  const newAnnotations: RedlinesAnnotation[] = [];
  let succeeded = 0, failed = 0, skipped = 0;
  const workset = finalCandidates;
  const tasks = workset.map((point) => limiter(async () => {
    try {
      let rubricPoints: string[] = [];
      try {
        const cov = await getCoverageResult(point.configId, point.runLabel, point.timestamp, point.promptId, point.modelId);
        if (cov?.pointAssessments) {
          rubricPoints = cov.pointAssessments.map((pa: any) => pa.keyPointText).filter(Boolean);
        }
      } catch {}
      if (rubricPoints.length === 0 && Array.isArray(point.failedCriteria)) {
        rubricPoints = point.failedCriteria.map(fc => fc.criterion).filter(Boolean);
      }
      rubricPoints = Array.from(new Set(rubricPoints));

      if (options.dryRun) {
        logger.info(`[DRY RUN] Would annotate: ${point.configId}/${point.promptId} for ${point.modelId} (${(point.coverageScore*100).toFixed(0)}%)`);
        skipped += 1;
        return;
      }

      const annotation = await annotatePoint(point, rubricPoints, modelId, temperature);
      newAnnotations.push(annotation);
      logger.info(`Annotated: ${point.configId}/${point.promptId} for ${point.modelId}`);
      succeeded += 1;
    } catch (e: any) {
      logger.warn(`Failed to annotate ${point.configId}/${point.promptId}/${point.modelId}: ${e?.message || e}`);
      failed += 1;
    }
  }));

  await Promise.all(tasks);

  if (!options.dryRun && newAnnotations.length > 0) {
    logger.info(`Overwriting redlines feeds with ${newAnnotations.length} new annotations...`);
    // Sort by creation time descending to show newest first in the feed
    const sortedAnnotations = newAnnotations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Save global redlines feed
    await saveRedlinesFeed({
      items: sortedAnnotations,
      lastUpdated: new Date().toISOString(),
    });
    
    // Save per-config redlines feeds
    const annotationsByConfig = new Map<string, RedlinesAnnotation[]>();
    for (const annotation of sortedAnnotations) {
      if (!annotationsByConfig.has(annotation.configId)) {
        annotationsByConfig.set(annotation.configId, []);
      }
      annotationsByConfig.get(annotation.configId)!.push(annotation);
    }
    
    for (const [configId, configAnnotations] of annotationsByConfig.entries()) {
      await saveConfigRedlinesFeed(configId, {
        items: configAnnotations,
        lastUpdated: new Date().toISOString(),
      });
      logger.info(`Saved ${configAnnotations.length} annotations for config: ${configId}`);
    }
    
    logger.success('Successfully saved global and per-config redlines feeds.');
  }

  logger.info(`Redlines summary: succeeded=${succeeded}, failed=${failed}, skipped=${skipped}`);
}

export const annotatePainPointsCommand = new Command('annotate-pain-points')
  .description('Annotate selected Pain Points with span-level Redlines (issues/praise)')
  .option('-v, --verbose', 'Verbose selection logging')
  .option('--min <number>', 'Minimum coverage score (default 0.2)', (v) => parseFloat(v))
  .option('--max <number>', 'Maximum coverage score (default 0.4)', (v) => parseFloat(v))
  .option('--min-len <number>', 'Minimum response length (default 200)', (v) => parseInt(v, 10))
  .option('--max-len <number>', 'Maximum response length (default 1000)', (v) => parseInt(v, 10))
  .option('--limit <number>', 'Maximum items to annotate (default 50)', (v) => parseInt(v, 10))
  .option('--pluck-from-config-max <number>', 'Maximum items to take from each config (default 10)', (v) => parseInt(v, 10))
  .option('--concurrency <number>', 'Parallelism (default 4)', (v) => parseInt(v, 10))
  .option('--model <id>', 'LLM model to use (default gemini-2.5-flash)')
  .option('--temperature <number>', 'LLM temperature (default 0.1)', (v) => parseFloat(v))
  .option('--ignore-tags <tags>', 'Comma-separated list of tags to ignore (e.g., "internal,wip")', '')
  .option('--dry-run', 'Show what would be annotated without calling the LLM', false)
  .action(actionAnnotatePainPoints);
