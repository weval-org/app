import * as yaml from 'js-yaml';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { BLUEPRINT_CONFIG_REPO_SLUG } from './configConstants';

export interface FixtureSet {
  version?: number;
  strategy?: 'seeded' | 'round-robin' | 'first';
  seed?: number | string;
  responses: Record<string, FixtureResponseSpec>;
}

export type FixtureValue = string | string[] | { turns: string[] };

export interface FixtureResponseSpec {
  default?: FixtureValue;
  byModel?: Record<string, FixtureValue>;
  notes?: string;
}

export interface SimpleLoggerLike {
  info: (msg: string, ...args: any[]) => void;
  warn: (msg: string, ...args: any[]) => void;
  error: (msg: string, ...args: any[]) => void;
}

export async function loadFixturesFromLocal(filePath: string, logger?: SimpleLoggerLike): Promise<FixtureSet | null> {
  try {
    const abs = path.resolve(filePath);
    const content = await fs.readFile(abs, 'utf-8');
    const isYaml = /\.ya?ml$/i.test(abs);
    const data = isYaml ? yaml.load(content) : JSON.parse(content);
    if (!data || typeof data !== 'object') return null;
    logger?.info(`[fixtures] Loaded local fixtures from ${abs}`);
    return data as FixtureSet;
  } catch (err: any) {
    logger?.warn(`[fixtures] Failed to load local fixtures from ${filePath}: ${err.message}`);
    return null;
  }
}

export async function fetchFixturesByName(
  fixturesName: string,
  githubToken?: string,
  logger?: SimpleLoggerLike
): Promise<{ fixtures: FixtureSet | null; fixturesPath: string | null; commitSha: string | null }>
{
  const apiHeaders: Record<string, string> = { 'Accept': 'application/vnd.github.v3+json' };
  const rawHeaders: Record<string, string> = { 'Accept': 'application/vnd.github.v3.raw' };
  if (githubToken) {
    apiHeaders['Authorization'] = `token ${githubToken}`;
    rawHeaders['Authorization'] = `token ${githubToken}`;
  }

  // Fetch latest commit (optional)
  let latestCommitSha: string | null = null;
  try {
    const commitUrl = `https://api.github.com/repos/${BLUEPRINT_CONFIG_REPO_SLUG}/commits/main`;
    const res = await axios.get(commitUrl, { headers: apiHeaders });
    latestCommitSha = res.data?.sha || null;
  } catch {}

  const treeApiUrl = `https://api.github.com/repos/${BLUEPRINT_CONFIG_REPO_SLUG}/git/trees/main?recursive=1`;
  logger?.info?.(`[fixtures] Fetching file tree for fixtures from: ${treeApiUrl}`);
  try {
    const treeRes = await axios.get(treeApiUrl, { headers: apiHeaders });
    const nodes = (treeRes.data?.tree || []).filter((n: any) => n.type === 'blob' && n.path.startsWith('fixtures/'));
    const base = `fixtures/${fixturesName}`;
    const candidates = [`${base}.yml`, `${base}.yaml`, `${base}.json`];
    const found = nodes.find((n: any) => candidates.includes(n.path));
    if (!found) {
      logger?.warn?.(`[fixtures] No fixtures found for '${fixturesName}' in repo.`);
      return { fixtures: null, fixturesPath: null, commitSha: latestCommitSha };
    }
    const resp = await axios.get(found.url, { headers: rawHeaders });
    const content = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    const isYaml = /\.ya?ml$/i.test(found.path);
    const parsed = isYaml ? yaml.load(content) : JSON.parse(content);
    logger?.info?.(`[fixtures] Loaded fixtures '${found.path}'.`);
    const fixturesPath = found.path.startsWith('fixtures/') ? found.path.substring('fixtures/'.length) : found.path;
    return { fixtures: parsed as FixtureSet, fixturesPath, commitSha: latestCommitSha };
  } catch (err: any) {
    logger?.error?.(`[fixtures] Error fetching fixtures '${fixturesName}': ${err.message}`);
    return { fixtures: null, fixturesPath: null, commitSha: latestCommitSha };
  }
}

export function pickFixtureValue(
  fixtures: FixtureSet | null | undefined,
  promptId: string,
  baseModelId: string,
  effectiveModelId: string,
  runLabel: string
): { turns?: string[]; final?: string } | null {
  if (!fixtures || !fixtures.responses) return null;
  const spec = fixtures.responses[promptId];
  if (!spec) return null;

  const value = resolveFixtureValue(spec, baseModelId) ?? spec.default;
  if (!value) return null;
  if (typeof value === 'string') return { final: value };
  if (Array.isArray(value)) return { final: pickFromArray(value, fixtures, promptId, effectiveModelId, runLabel) };
  if (typeof value === 'object' && value.turns && Array.isArray(value.turns)) return { turns: [...value.turns] };
  return null;
}

function resolveFixtureValue(spec: FixtureResponseSpec, baseModelId: string): FixtureValue | undefined {
  if (!spec.byModel) return undefined;
  if (spec.byModel[baseModelId] !== undefined) return spec.byModel[baseModelId];
  // simple wildcard suffix support: 'gpt-4o*'
  for (const key of Object.keys(spec.byModel)) {
    if (key.endsWith('*')) {
      const prefix = key.slice(0, -1);
      if (baseModelId.startsWith(prefix)) return spec.byModel[key];
    }
  }
  return undefined;
}

function pickFromArray(
  arr: string[],
  fixtures: FixtureSet,
  promptId: string,
  effectiveModelId: string,
  runLabel: string
): string {
  const strategy = fixtures.strategy || 'seeded';
  if (strategy === 'first') return arr[0];
  if (strategy === 'round-robin') {
    // round-robin not persisted: fallback deterministic seeded using index 0
    return arr[0];
  }
  // seeded deterministic pick
  const seed = String(fixtures.seed ?? '0');
  const key = `${seed}|${runLabel}|${promptId}|${effectiveModelId}`;
  const idx = simpleHash(key) % arr.length;
  return arr[idx];
}

function simpleHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}


