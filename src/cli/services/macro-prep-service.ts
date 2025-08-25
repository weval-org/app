import path from 'path';
import pLimit from '@/lib/pLimit';
import { getConfig } from '@/cli/config';
import { getLatestRunsSummary, listConfigIds, listRunsForConfig, getCoreResult, saveMacroFlatManifest, saveMacroFlatData, saveMacroPerModelManifest, saveMacroPerModelData } from '@/lib/storageService';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
// duplicate import removed

type Logger = ReturnType<typeof getConfig>['logger'];

interface LatestRunRef {
    configId: string;
    configTitle?: string;
    runLabel: string;
    timestamp: string;
}

export async function discoverLatestRuns(logger: Logger): Promise<LatestRunRef[]> {
    const start = Date.now();
    try {
        const latestSummary = await getLatestRunsSummary();
        if (latestSummary && latestSummary.runs && latestSummary.runs.length > 0) {
            // Deduplicate to one (newest) run per configId and pre-filter obvious excludes to avoid unnecessary core reads
            const byConfig = new Map<string, LatestRunRef>();
            for (const r of latestSummary.runs) {
                const id = r.configId || '';
                // Pre-filter name-based excludes (_compass, compass__*, sandbox*)
                const idLower = id.toLowerCase();
                if (idLower.startsWith('_compass') || idLower.startsWith('compass__') || idLower.startsWith('sandbox') || idLower.startsWith('test')) {
                    continue;
                }
                const existing = byConfig.get(id);
                if (!existing || (r.timestamp && existing.timestamp && r.timestamp > existing.timestamp)) {
                    byConfig.set(id, { configId: r.configId, configTitle: r.configTitle, runLabel: r.runLabel, timestamp: r.timestamp });
                }
            }
            const refs = Array.from(byConfig.values());
            await logger.info(`[MacroPrep] Discovered ${refs.length} latest runs (deduped by config) from summary in ${Date.now() - start}ms.`);
            return refs;
        }
    } catch (e: any) {
        await logger.warn(`[MacroPrep] Could not use latest runs summary: ${e.message}. Falling back to scanning.`);
    }

    const configIds = await listConfigIds();
    const out: LatestRunRef[] = [];
    for (const configId of configIds) {
        const runs = await listRunsForConfig(configId);
        if (runs.length > 0) {
            const newest = runs[0];
            if (!newest.timestamp) continue;
            out.push({ configId, runLabel: newest.runLabel, timestamp: newest.timestamp });
        }
    }
    await logger.info(`[MacroPrep] Discovered ${out.length} latest runs by scanning in ${Date.now() - start}ms.`);
    return out;
}

export function computeScoreByte(coverageExtent: number | undefined, isInverted: boolean | undefined): number {
    if (coverageExtent === undefined || isNaN(coverageExtent)) return 0;
    const score = isInverted ? (1 - coverageExtent) : coverageExtent;
    let v = Math.round(score * 255);
    if (v < 0) v = 0; if (v > 255) v = 255;
    return v;
}

export async function buildMacroFlat(): Promise<void> {
    const { logger } = getConfig();
    const t0 = Date.now();
    await logger.info('[MacroPrep:Flat] Starting flat macro build...');
    const latestRuns = await discoverLatestRuns(logger);
    latestRuns.sort((a, b) => a.configId.localeCompare(b.configId));

    let totalPoints = 0;
    const coreCache = new Map<string, any>();
    const rk = (r: LatestRunRef) => `${r.configId}|${r.runLabel}|${r.timestamp}`;
    const order: Array<{ run: LatestRunRef; pid: string; mid: string; count: number }> = [];

    for (const run of latestRuns) {
        let core = coreCache.get(rk(run));
        if (!core) {
            core = await getCoreResult(run.configId, run.runLabel, run.timestamp);
            if (core) coreCache.set(rk(run), core);
        }
        if (!core) continue;
        const id = run.configId || core.configId;
        const tags: string[] = core.config?.tags || [];
        const tagsLower = Array.isArray(tags) ? tags.map((t: string) => (t || '').toLowerCase()) : [];
        const sourcePath: string | undefined = core.sourceBlueprintFileName;
        const hasSandboxTag = tagsLower.includes('sandbox');
        const idLooksSandbox = !!id && (id.toLowerCase().startsWith('sandbox') || id.toLowerCase().includes('/sandbox'));
        const pathLooksSandbox = !!sourcePath && sourcePath.toLowerCase().includes('/sandbox/');
        const hasSandboxFlag = Boolean((core as any).sandboxId || (core as any).isSandbox);
        if ((id && id.startsWith('_compass')) || tagsLower.includes('test') || hasSandboxTag || idLooksSandbox || pathLooksSandbox || hasSandboxFlag) {
            continue;
        }
        const prompts = (core.promptIds || Object.keys(core.allFinalAssistantResponses || {})).sort((a: string, b: string) => a.localeCompare(b));
        const llmCoverage = core.evaluationResults?.llmCoverageScores || {};
        for (const pid of prompts) {
            const modelMap = llmCoverage[pid] || {};
            const modelIds = Object.keys(modelMap).filter((m: string) => m.toLowerCase() !== 'ideal').sort((a: string, b: string) => a.localeCompare(b));
            for (const mid of modelIds) {
                const entry = modelMap[mid];
                if (!entry || 'error' in entry || !Array.isArray(entry.pointAssessments)) continue;
                const count = entry.pointAssessments.length;
                if (count <= 0) continue;
                order.push({ run, pid, mid, count });
                totalPoints += count;
            }
        }
    }

    if (totalPoints === 0) { await logger.warn('[MacroPrep:Flat] No points found.'); return; }

    const width = Math.ceil(Math.sqrt(totalPoints));
    const height = Math.ceil(totalPoints / width);
    await saveMacroFlatManifest({ width, height, totalPoints, generatedAt: new Date().toISOString() });

    const data = new Uint8Array(width * height);
    let i = 0;
    let sum = 0; let count = 0;
    const perModelBuffers = new Map<string, { buf: Uint8Array; sum: number; count: number }>();
    for (const seg of order) {
        const core = coreCache.get(rk(seg.run));
        const pa = core?.evaluationResults?.llmCoverageScores?.[seg.pid]?.[seg.mid]?.pointAssessments || [];
        const canonical = parseModelIdForDisplay(seg.mid).baseId;
        if (!perModelBuffers.has(canonical)) {
            perModelBuffers.set(canonical, { buf: new Uint8Array(Math.max(1024, seg.count)), sum: 0, count: 0 });
        }
        const pm = perModelBuffers.get(canonical)!;
        let pmIdx = pm.count;
        for (const p of pa as Array<{ coverageExtent?: number; isInverted?: boolean }>) {
            const byte = computeScoreByte(p.coverageExtent, (p as any).isInverted);
            data[i++] = byte;
            sum += byte;
            count++;
            // Grow per-model buffer if needed
            if (pmIdx >= pm.buf.length) {
                const grown = new Uint8Array(pm.buf.length + 1024);
                grown.set(pm.buf, 0);
                pm.buf = grown;
            }
            pm.buf[pmIdx++] = byte;
            pm.sum += byte;
            pm.count++;
        }
    }
    await saveMacroFlatData(data);
    const headlineAverage = count > 0 ? (sum / count) / 255 : 0;
    await saveMacroFlatManifest({ width, height, totalPoints, generatedAt: new Date().toISOString(), headlineAverage });
    // Save per-model manifolds
    const perModelManifest = { models: [] as { modelId: string; width: number; height: number; totalPoints: number; average: number }[], generatedAt: new Date().toISOString() };
    for (const [canonicalId, pm] of perModelBuffers.entries()) {
        const trimmed = pm.buf.subarray(0, pm.count);
        await saveMacroPerModelData(canonicalId, trimmed);
        perModelManifest.models.push({ modelId: canonicalId, width: pm.count, height: 1, totalPoints: pm.count, average: pm.count > 0 ? (pm.sum / pm.count) / 255 : 0 });
    }
    await saveMacroPerModelManifest(perModelManifest);
    await logger.info(`[MacroPrep:Flat] Per-model entries saved: ${perModelManifest.models.length}`);
    await logger.success(`[MacroPrep:Flat] Wrote flat macro data ${width}×${height} (${totalPoints} points). Headline avg=${(headlineAverage*100).toFixed(2)}% in ${Date.now() - t0}ms.`);
}


