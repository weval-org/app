import { WevalResult, WevalArticle } from '@/types/shared';
import { generateMarkdownReportAnonymized } from '@/app/utils/markdownGenerator';
import { getConfig } from '../config';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { parseModelIdForDisplay, extractMakerFromModelId } from '@/app/utils/modelIdUtils';
import { deanonymizeModelNamesInText } from './executive-summary-service';
import { generateArticleSystemPrompt, AnonymizedModelReference } from './article-prompt';
import { getModelResponse } from './llm-service';

const SUMMARIZER_MODEL_ID = 'openrouter:google/gemini-2.5-flash';
const MAX_CHARS = 2000000; // ~700k tokens?

type Logger = ReturnType<typeof getConfig>['logger'];

export interface ModelAnonymizationMapping {
    realToAnonymized: Map<string, { realId: string; maker: string; model: string; sys?: string; temp?: string }>;
    anonymizedToReal: Map<string, string>;
    makerToReal: Map<string, string>;
    modelToReal: Map<string, string>;
    sysToReal: Map<string, string | number>;
    tempToReal: Map<string, number>;
}

export function createModelAnonymizationMappingForArticle(modelIds: string[]): ModelAnonymizationMapping {
    const realToAnonymized = new Map<string, { realId: string; maker: string; model: string; sys?: string; temp?: string }>();
    const anonymizedToReal = new Map<string, string>();
    const makerToReal = new Map<string, string>();
    const modelToReal = new Map<string, string>();
    const sysToReal = new Map<string, string | number>();
    const tempToReal = new Map<string, number>();

    const uniqueMakers = new Set<string>();
    const uniqueModels = new Set<string>();
    const uniqueSys = new Set<string | number>();
    const uniqueTemps = new Set<number>();

    for (const id of modelIds) {
        const parsed = parseModelIdForDisplay(id);
        const maker = extractMakerFromModelId(id);
        uniqueMakers.add(maker);
        uniqueModels.add(parsed.baseId);
        if (parsed.systemPromptIndex !== undefined) uniqueSys.add(parsed.systemPromptIndex);
        if (parsed.temperature !== undefined) uniqueTemps.add(parsed.temperature);
    }

    Array.from(uniqueMakers).sort().forEach((maker, i) => makerToReal.set(`MK_${5000 + i}`, maker));
    Array.from(uniqueModels).sort().forEach((model, i) => modelToReal.set(`MD_${6000 + i}`, model));
    Array.from(uniqueSys).sort().forEach((sys, i) => sysToReal.set(`S_${7000 + i}`, sys));
    Array.from(uniqueTemps).sort().forEach((t, i) => tempToReal.set(`T_${8000 + i}`, t));

    for (const id of modelIds) {
        const parsed = parseModelIdForDisplay(id);
        const maker = extractMakerFromModelId(id);
        const makerOpaque = Array.from(makerToReal.entries()).find(([, real]) => real === maker)?.[0] || 'MK_UNKNOWN';
        const modelOpaque = Array.from(modelToReal.entries()).find(([, real]) => real === parsed.baseId)?.[0] || 'MD_UNKNOWN';
        const sysOpaque = parsed.systemPromptIndex !== undefined ? Array.from(sysToReal.entries()).find(([, real]) => real === parsed.systemPromptIndex)?.[0] : undefined;
        const tempOpaque = parsed.temperature !== undefined ? Array.from(tempToReal.entries()).find(([, real]) => real === parsed.temperature)?.[0] : undefined;
        realToAnonymized.set(id, { realId: id, maker: makerOpaque, model: modelOpaque, sys: sysOpaque, temp: tempOpaque });
        anonymizedToReal.set(id, id);
    }

    return { realToAnonymized, anonymizedToReal, makerToReal, modelToReal, sysToReal, tempToReal };
}

export function anonymizeResultForArticle(result: WevalResult, mapping: ModelAnonymizationMapping): WevalResult {
    const clone = JSON.parse(JSON.stringify(result));
    const replace = (realId: string) => {
        const a = mapping.realToAnonymized.get(realId);
        if (!a) return realId;
        let id = `${a.maker}_${a.model}`;
        if (a.sys) id += `_${a.sys}`;
        if (a.temp) id += `_${a.temp}`;
        return id;
    };
    clone.effectiveModels = clone.effectiveModels.map(replace);
    if (clone.modelSystemPrompts) {
        clone.modelSystemPrompts = Object.fromEntries(Object.entries(clone.modelSystemPrompts).map(([k, v]) => [replace(k), v]));
    }
    if (clone.allFinalAssistantResponses) {
        clone.allFinalAssistantResponses = Object.fromEntries(
            Object.entries(clone.allFinalAssistantResponses).map(([p, models]) => [p, Object.fromEntries(Object.entries(models as object).map(([k, v]) => [replace(k), v]))])
        );
    }
    const er = clone.evaluationResults;
    if (er?.llmCoverageScores) {
        er.llmCoverageScores = Object.fromEntries(
            Object.entries(er.llmCoverageScores).map(([p, m]) => [p, Object.fromEntries(Object.entries(m as object).map(([k, v]) => [replace(k), v]))])
        ) as any;
    }
    if (er?.perPromptSimilarities) {
        er.perPromptSimilarities = Object.fromEntries(
            Object.entries(er.perPromptSimilarities).map(([p, matrix]) => [p, Object.fromEntries(Object.entries(matrix as object).map(([a, scores]) => [replace(a), Object.fromEntries(Object.entries(scores as object).map(([b, val]) => [replace(b), val]))]))])
        ) as any;
    }
    return clone;
}

function extractTitleAndDeck(markdown: string): { title: string; deck?: string; content: string } {
    const lines = markdown.trim().split('\n');
    let title = 'Untitled Article';
    let deck: string | undefined;
    let startIdx = 0;
    if (lines[0]?.startsWith('# ')) {
        title = lines[0].replace(/^#\s+/, '').trim();
        startIdx = 1;
        if (lines[1] && lines[1].trim() && !lines[1].startsWith('## ')) {
            deck = lines[1].trim();
            startIdx = 2;
        }
    }
    const content = lines.slice(startIdx).join('\n');
    return { title, deck, content };
}

export async function generateArticle(resultData: WevalResult, logger: Logger): Promise<WevalArticle | { error: string }> {
    try {
        logger.info(`Generating article with model: ${SUMMARIZER_MODEL_ID}`);
        const evaluated = resultData.effectiveModels.filter(m => m !== 'ideal' && m !== IDEAL_MODEL_ID);
        const mapping = createModelAnonymizationMappingForArticle(evaluated);

        const anon = anonymizeResultForArticle(resultData, mapping);
        const sysIndexToAnon = new Map<number, string>();
        for (const [anonId, real] of mapping.sysToReal.entries()) {
            if (typeof real === 'number') sysIndexToAnon.set(real, anonId);
        }
        const tempToAnon = new Map<number, string>();
        for (const [anonId, real] of mapping.tempToReal.entries()) {
            if (typeof real === 'number') tempToAnon.set(real, anonId);
        }

        const report = generateMarkdownReportAnonymized(anon, MAX_CHARS, sysIndexToAnon, tempToAnon);

        const modelRefs: AnonymizedModelReference[] = evaluated.map(id => {
            const a = mapping.realToAnonymized.get(id);
            if (!a) throw new Error(`Missing anonymization for ${id}`);
            return { maker: a.maker, model: a.model, sys: a.sys, temp: a.temp };
        });
        const systemPrompt = generateArticleSystemPrompt(modelRefs);

        const response = await getModelResponse({
            modelId: SUMMARIZER_MODEL_ID,
            messages: [{ role: 'user', content: '=== THE REPORT ===\n\n' + report }],
            systemPrompt,
            temperature: 0.2,
            maxTokens: 30000,
            useCache: true,
            timeout: 120000,
            retries: 2,
        });

        if (!response || response.trim() === '') {
            const msg = 'Article model returned empty content';
            logger.error(msg);
            return { error: msg };
        }

        // Convert <ref /> tags to markdown, then strip links (plain text only for article)
        const linkified = deanonymizeModelNamesInText(response, mapping as any);
        const plainTextRefs = linkified.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
        const { title, deck, content } = extractTitleAndDeck(plainTextRefs);

        // Basic reading time (rough): 200 wpm
        const words = content.split(/\s+/).filter(Boolean).length;
        const readingTimeMin = Math.max(1, Math.round(words / 200));

        return {
            modelId: SUMMARIZER_MODEL_ID,
            title,
            deck,
            content,
            isStructured: false,
            meta: { readingTimeMin }
        };
    } catch (e: any) {
        const msg = `Error generating article: ${e.message}`;
        getConfig().logger.error(msg);
        return { error: msg };
    }
}


