import { getConfig } from '../config';
import { ModelSummary } from '../types/model_card_types';
import { getModelResponse } from './llm-service';
import { getResultByFileName } from '../../lib/storageService';
import { ComparisonDataV2 } from '@/app/utils/types';

type Logger = ReturnType<typeof getConfig>['logger'];

const ANALYST_MODEL_ID = 'openrouter:google/gemini-2.5-flash';
const MAX_CONTEXT_TOKENS = 750_000;

/**
 * Parses <ref /> tags and converts them to markdown links for model card display.
 * Supports config references like <ref config="config-id" title="Config Title" />
 */
export function parseConfigReferences(text: string): string {
    let result = text;

    // Handle <ref /> tags for configs
    const refTagRegex = /<ref\s+([^>]+)\s*\/>/g;
    
    result = result.replace(refTagRegex, (match, attributes) => {
        const attrs: Record<string, string> = {};
        
        // Parse attributes
        const attrRegex = /(\w+)="([^"]+)"/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attributes)) !== null) {
            attrs[attrMatch[1]] = attrMatch[2];
        }

        // Handle config references
        if (attrs.config) {
            const title = attrs.title || attrs.config;
            const analysisUrl = `/analysis/${attrs.config}`;
            return `[${title}](${analysisUrl})`;
        }

        // If we can't parse it, return the title or the original match
        return attrs.title || match;
    });

    return result;
}

function parseAnalystResponse(responseText: string): Omit<Required<ModelSummary>['analyticalSummary'], 'lastUpdated'> {
    // Parse the raw content first
    const rawTldrMatch = responseText.match(/<tldr>(.*?)<\/tldr>/s);
    const rawTldr = rawTldrMatch ? rawTldrMatch[1].trim() : '';
    const rawStrengths = [...responseText.matchAll(/<strength>(.*?)<\/strength>/gs)].map(match => match[1].trim());
    const rawWeaknesses = [...responseText.matchAll(/<weakness>(.*?)<\/weakness>/gs)].map(match => match[1].trim());
    const rawRisks = [...responseText.matchAll(/<risk>(.*?)<\/risk>/gs)].map(match => match[1].trim());
    const rawPatterns = [...responseText.matchAll(/<pattern>(.*?)<\/pattern>/gs)].map(match => match[1].trim());

    // Parse config references in each section
    const tldr = rawTldr ? parseConfigReferences(rawTldr) : '';
    const strengths = rawStrengths.map(parseConfigReferences);
    const weaknesses = rawWeaknesses.map(parseConfigReferences);
    const risks = rawRisks.map(parseConfigReferences);
    const patterns = rawPatterns.map(parseConfigReferences);

    // Extract and parse the narrative from the "Analyst's Narrative" section.
    const narrativeMatch = responseText.match(/\*\*Analyst's Narrative\*\*\s*([\s\S]*)/);
    let narrative = narrativeMatch ? narrativeMatch[1].trim() : '';
    if (narrative) {
        narrative = parseConfigReferences(narrative);
    }

    return { tldr, narrative, strengths, weaknesses, risks, patterns };
}


export async function generateAnalyticalSummary(
    modelSummary: ModelSummary,
    logger: Logger,
): Promise<ModelSummary['analyticalSummary']> {

    logger.info(`Generating analytical summary for model: ${modelSummary.modelId} using ${ANALYST_MODEL_ID}`);
    
    // Calculate aggregate comparative statistics first
    const validRanks = modelSummary.overallStats.runs.filter(r => r.rank !== null).map(r => r.rank!);
    const validPeerComparisons = modelSummary.overallStats.runs.filter(r => r.peerAverageScore !== null);
    const runsWithModelCounts = modelSummary.overallStats.runs.filter(r => r.totalModelsInRun && r.rank !== null);
    
    let aggregateStats = '';
    if (validRanks.length > 0) {
        const avgRank = validRanks.reduce((a, b) => a + b, 0) / validRanks.length;
        const bestRank = Math.min(...validRanks);
        const worstRank = Math.max(...validRanks);
        aggregateStats += `AVERAGE RANK ACROSS RUNS: ${avgRank.toFixed(1)} (Best: #${bestRank}, Worst: #${worstRank})\n`;
        
        // Calculate rank distribution
        const topQuartileRuns = validRanks.filter(r => r <= Math.ceil(validRanks.length * 0.25)).length;
        const topHalfRuns = validRanks.filter(r => r <= Math.ceil(validRanks.length * 0.5)).length;
        aggregateStats += `RANKING CONSISTENCY: Top quartile ${topQuartileRuns}/${validRanks.length} runs, Top half ${topHalfRuns}/${validRanks.length} runs\n`;
    }
    
    // More precise percentile analysis when we have model counts
    if (runsWithModelCounts.length > 0) {
        const percentiles = runsWithModelCounts.map(r => 
            ((r.totalModelsInRun! - r.rank! + 1) / r.totalModelsInRun!) * 100
        );
        const avgPercentile = percentiles.reduce((a, b) => a + b, 0) / percentiles.length;
        const topTierRuns = percentiles.filter(p => p >= 80).length; // Top 20%
        const competitiveRuns = percentiles.filter(p => p >= 50).length; // Above median
        const q1 = percentiles.filter(p => p >= 75).length; // Top quartile
        const q2 = percentiles.filter(p => p >= 50 && p < 75).length; // Second quartile
        const q3 = percentiles.filter(p => p >= 25 && p < 50).length; // Third quartile
        const q4 = percentiles.filter(p => p < 25).length; // Bottom quartile

        const avgCohort = runsWithModelCounts.reduce((a, r) => a + (r.totalModelsInRun || 0), 0) / runsWithModelCounts.length;
        const avgBetter = runsWithModelCounts.reduce((a, r) => a + ((r.rank || 1) - 1), 0) / runsWithModelCounts.length;
        const avgWorse = runsWithModelCounts.reduce((a, r) => a + ((r.totalModelsInRun || 0) - (r.rank || 0)), 0) / runsWithModelCounts.length;
        
        aggregateStats += `COMPETITIVE POSITIONING: ${avgPercentile.toFixed(1)}th percentile average across ${runsWithModelCounts.length} runs\n`;
        aggregateStats += `QUARTILE DISTRIBUTION: Q1 ${q1}, Q2 ${q2}, Q3 ${q3}, Q4 ${q4} (out of ${runsWithModelCounts.length})\n`;
        aggregateStats += `AVERAGE RELATIVE POSITION: ${(avgBetter).toFixed(1)} models ahead, ${(avgWorse).toFixed(1)} behind (avg cohort size ${(avgCohort).toFixed(1)})\n`;
        aggregateStats += `TIER ANALYSIS: Top-tier (80th+ percentile) in ${topTierRuns}/${runsWithModelCounts.length} runs, Above-median in ${competitiveRuns}/${runsWithModelCounts.length} runs\n`;
    }
    
    if (validPeerComparisons.length > 0) {
        const outperformedPeerCount = validPeerComparisons.filter(r => r.hybridScore > r.peerAverageScore!).length;
        const peerWinRate = (outperformedPeerCount / validPeerComparisons.length) * 100;
        aggregateStats += `PEER COMPARISON WIN RATE: ${peerWinRate.toFixed(1)}% (${outperformedPeerCount}/${validPeerComparisons.length} runs above peer average)\n`;
        
        const avgOutperformance = validPeerComparisons.reduce((sum, r) => sum + (r.hybridScore - r.peerAverageScore!), 0) / validPeerComparisons.length;
        aggregateStats += `AVERAGE PERFORMANCE vs PEERS: ${avgOutperformance > 0 ? '+' : ''}${avgOutperformance.toFixed(3)} points\n`;
        
        // Performance consistency analysis
        const strongWins = validPeerComparisons.filter(r => r.hybridScore / r.peerAverageScore! >= 1.15).length;
        const solidWins = validPeerComparisons.filter(r => r.hybridScore / r.peerAverageScore! >= 1.05).length;
        if (strongWins > 0 || solidWins > 0) {
            aggregateStats += `DOMINANCE ANALYSIS: Strong outperformance (+15%) in ${strongWins}/${validPeerComparisons.length} runs, Solid outperformance (+5%) in ${solidWins}/${validPeerComparisons.length} runs\n`;
        }
    }
    
    // 1. Construct the enhanced prompt
    let dossier = `COMPREHENSIVE PERFORMANCE DOSSIER FOR MODEL: ${modelSummary.modelId}\n\n`;
    dossier += `OVERALL AVERAGE SCORE: ${modelSummary.overallStats.averageHybridScore?.toFixed(3)}\n`;
    dossier += `TOTAL BLUEPRINTS EVALUATED: ${modelSummary.overallStats.totalBlueprints}\n`;
    dossier += `TOTAL EVALUATION RUNS: ${modelSummary.overallStats.totalRuns}\n\n`;
    
    // Add information about the actual model variants being analyzed
    if (modelSummary.discoveredModelIds && modelSummary.discoveredModelIds.length > 0) {
        dossier += `IMPORTANT: This analysis aggregates performance data from the following ${modelSummary.discoveredModelIds.length} model variant(s):\n`;
        modelSummary.discoveredModelIds.forEach((modelId, index) => {
            dossier += `  ${index + 1}. ${modelId}\n`;
        });
        dossier += `All performance data below represents the combined behavior of these variants when pattern "${modelSummary.modelId}" was matched.\n\n`;
    } else {
        dossier += `NOTE: This analysis is based on pattern matching for "${modelSummary.modelId}". Specific model variants are not tracked.\n\n`;
    }
    
    if (aggregateStats) {
        dossier += `AGGREGATE COMPETITIVE PERFORMANCE:\n${aggregateStats}\n`;
    }
    
    dossier += `------------------------------------\n`;
    dossier += `DETAILED RUN-BY-RUN PERFORMANCE:\n`;
    dossier += `------------------------------------\n\n`;

    for (const run of modelSummary.overallStats.runs) {
        let runRecord = `Blueprint: "${run.configTitle}" (ID: ${run.configId})\n`;
        runRecord += `  - This Model's Score: ${run.hybridScore.toFixed(3)}\n`;
        
        if (run.peerAverageScore !== null) {
            const outperformance = run.hybridScore - run.peerAverageScore;
            runRecord += `  - Peer Average Score: ${run.peerAverageScore.toFixed(3)} (${outperformance > 0 ? '+' : ''}${outperformance.toFixed(3)} vs peers)\n`;
        }
        
        if (run.rank !== null) {
            // Use actual total models if available, otherwise estimate
            const totalModels = run.totalModelsInRun || "unknown number of";
            let percentileText = "";
            
            if (run.totalModelsInRun && run.totalModelsInRun > 1) {
                const percentile = ((run.totalModelsInRun - run.rank + 1) / run.totalModelsInRun) * 100;
                percentileText = ` (${percentile.toFixed(0)}th percentile)`;
            } else if (run.peerAverageScore !== null) {
                // Fallback estimation when we don't have exact count
                percentileText = ` (~${(100 - ((run.rank - 1) / Math.max(run.rank, 3)) * 100).toFixed(0)}th percentile estimated)`;
            }
            
            runRecord += `  - Rank in Run: #${run.rank} out of ${totalModels} models${percentileText}\n`;
            if (typeof totalModels === 'number') {
                const better = Math.max(0, (run.rank || 1) - 1);
                const worse = Math.max(0, totalModels - (run.rank || 0));
                runRecord += `  - Relative Position: ${better} ranked above, ${worse} ranked below\n`;
            }
        }
        
        // Add performance characterization
        if (run.peerAverageScore !== null) {
            const relativePerf = run.hybridScore / run.peerAverageScore;
            let perfCategory = "";
            if (relativePerf >= 1.15) perfCategory = "SIGNIFICANTLY OUTPERFORMED peers";
            else if (relativePerf >= 1.05) perfCategory = "OUTPERFORMED peers";
            else if (relativePerf >= 0.95) perfCategory = "MATCHED peer performance";
            else if (relativePerf >= 0.85) perfCategory = "UNDERPERFORMED vs peers";
            else perfCategory = "SIGNIFICANTLY UNDERPERFORMED vs peers";
            
            runRecord += `  - Comparative Assessment: ${perfCategory}\n`;
        }
        
        // Add system prompt context information
        if (modelSummary.systemPromptMappings && modelSummary.systemPromptMappings[run.configId]) {
            const configPrompts = modelSummary.systemPromptMappings[run.configId];
            const uniqueSystemPrompts = new Set(Object.values(configPrompts));
            
            if (uniqueSystemPrompts.size > 1) {
                runRecord += `  - System Prompt Variations: This run tested ${uniqueSystemPrompts.size} different system prompts:\n`;
                Array.from(uniqueSystemPrompts).forEach((prompt, idx) => {
                    const truncatedPrompt = prompt.length > 100 ? prompt.substring(0, 100) + "..." : prompt;
                    runRecord += `    ${idx + 1}. "${truncatedPrompt}"\n`;
                });
            } else if (uniqueSystemPrompts.size === 1) {
                const singlePrompt = Array.from(uniqueSystemPrompts)[0];
                const truncatedPrompt = singlePrompt.length > 150 ? singlePrompt.substring(0, 150) + "..." : singlePrompt;
                runRecord += `  - System Prompt: "${truncatedPrompt}"\n`;
            }
        }
        
        if (run.executiveSummary) {
            runRecord += `  - Executive Summary Extract:\n---\n${run.executiveSummary}\n---\n\n`;
        } else {
            runRecord += `\n`;
        }
        
        dossier += runRecord;
    }
    
    // Add performance pattern analysis
    if (modelSummary.performanceByTag && Object.keys(modelSummary.performanceByTag).length > 0) {
        dossier += `------------------------------------\n`;
        dossier += `PERFORMANCE BY EVALUATION CATEGORY:\n`;
        dossier += `------------------------------------\n\n`;
        
        const sortedTags = Object.entries(modelSummary.performanceByTag)
            .sort(([,a], [,b]) => (b.averageScore || 0) - (a.averageScore || 0));
            
        for (const [tag, data] of sortedTags) {
            dossier += `${tag.toUpperCase()}: ${data.averageScore?.toFixed(3) || 'N/A'} avg score across ${data.blueprintCount} blueprint${data.blueprintCount !== 1 ? 's' : ''}\n`;
        }
        dossier += `\n`;
    }
    
    // Include worst runs vs peers (most negative outperformance)
    if (modelSummary.overallStats.runs.length > 0) {
        const runsWithPeer = modelSummary.overallStats.runs
            .filter(r => r.peerAverageScore !== null)
            .map(r => ({
                ...r,
                outperformance: (r.hybridScore - (r.peerAverageScore as number)),
            }))
            .sort((a, b) => a.outperformance - b.outperformance);
        if (runsWithPeer.length > 0) {
            const worstRuns = runsWithPeer.slice(0, Math.min(5, runsWithPeer.length));
            dossier += `------------------------------------\n`;
            dossier += `WORST RUNS VS PEER AVERAGE:\n`;
            dossier += `------------------------------------\n`;
            for (const wr of worstRuns) {
                const percentile = (wr.totalModelsInRun && wr.rank)
                    ? (((wr.totalModelsInRun - wr.rank + 1) / wr.totalModelsInRun) * 100).toFixed(0) + 'th pct'
                    : 'n/a';
                dossier += `- ${wr.configTitle} (ID: ${wr.configId}): Δ ${wr.outperformance.toFixed(3)} vs peers; Rank #${wr.rank ?? 'n/a'} (${percentile})\n`;
            }
            dossier += `\n`;
        }
    }

    // Include worst-offending prompts from NDeltas if present
    if (modelSummary.worstPerformingEvaluations && modelSummary.worstPerformingEvaluations.length > 0) {
        dossier += `------------------------------------\n`;
        dossier += `WORST-OFFENDING PROMPTS (COVERAGE DELTAS):\n`;
        dossier += `------------------------------------\n`;
        for (const w of modelSummary.worstPerformingEvaluations) {
            const ref = `<ref config="${w.configId}" title="${w.configTitle}" />`;
            dossier += `- ${ref} | prompt: ${w.promptId} | Δ ${w.delta.toFixed(3)} (model ${w.modelCoverage.toFixed(2)} vs peers ${w.peerAverageCoverage.toFixed(2)})\n`;
        }
        dossier += `\n`;
    }

    // Deep context for bottom-3 worst prompts: prompt text, key point failures, judge reflections
    if (modelSummary.worstPerformingEvaluations && modelSummary.worstPerformingEvaluations.length > 0) {
        const worstThree = modelSummary.worstPerformingEvaluations.slice(0, 3);
        dossier += `------------------------------------\n`;
        dossier += `DETAILED CONTEXT: BOTTOM 3 PROMPTS\n`;
        dossier += `------------------------------------\n`;
        const truncate = (text: string, maxLen = 220) => (text.length > maxLen ? text.slice(0, maxLen) + '…' : text);
        for (const w of worstThree) {
            try {
                const fileName = `${w.runLabel}_${w.timestamp}_comparison.json`;
                const data = await getResultByFileName(w.configId, fileName) as ComparisonDataV2 | null;
                if (!data) {
                    continue;
                }
                const ref = `<ref config=\"${w.configId}\" title=\"${data.configTitle || w.configTitle}\" />`;
                // Prompt text extraction
                let promptText = '';
                const targetPrompt = data.config?.prompts?.find(p => p.id === w.promptId);
                if (targetPrompt?.promptText) {
                    promptText = targetPrompt.promptText;
                } else if (Array.isArray(targetPrompt?.messages)) {
                    const firstUser = targetPrompt!.messages!.find(m => m.role === 'user');
                    promptText = firstUser?.content || '';
                } else if (data.promptContexts && data.promptContexts[w.promptId]) {
                    const ctx = data.promptContexts[w.promptId];
                    if (typeof ctx === 'string') promptText = ctx;
                    else if (Array.isArray(ctx)) {
                        const firstUser = ctx.find(m => m.role === 'user');
                        promptText = firstUser?.content || '';
                    }
                }

                // Choose a representative variant among discovered IDs present in this run
                const candidates = (data.effectiveModels || []).filter(m =>
                    (modelSummary.discoveredModelIds?.includes(m)) || m.includes(modelSummary.modelId)
                );
                let chosenModel: string | null = null;
                let chosenCoverage: any = null;
                if (candidates.length > 0 && data.evaluationResults?.llmCoverageScores?.[w.promptId]) {
                    let bestScore = Infinity;
                    for (const m of candidates) {
                        const cov = data.evaluationResults.llmCoverageScores[w.promptId][m];
                        const score = cov?.avgCoverageExtent ?? Number.POSITIVE_INFINITY;
                        if (score < bestScore) {
                            bestScore = score;
                            chosenModel = m;
                            chosenCoverage = cov;
                        }
                    }
                }

                dossier += `• ${ref} | prompt: \"${truncate(promptText || w.promptId)}\" (id: ${w.promptId})\n`;
                if (chosenModel && chosenCoverage) {
                    const avg = typeof chosenCoverage.avgCoverageExtent === 'number' ? chosenCoverage.avgCoverageExtent.toFixed(3) : 'n/a';
                    dossier += `  - Variant analyzed: ${chosenModel}\n`;
                    dossier += `  - Coverage (avg): ${avg}\n`;
                    // Key assessments: take bottom 3 points by coverageExtent
                    const points = Array.isArray(chosenCoverage.pointAssessments) ? chosenCoverage.pointAssessments : [];
                    if (points.length > 0) {
                        const sorted = [...points].sort((a, b) => (a.coverageExtent ?? 1) - (b.coverageExtent ?? 1));
                        const bottom = sorted.slice(0, Math.min(3, sorted.length));
                        dossier += `  - Weakest criteria (judge reflections excerpted):\n`;
                        for (const p of bottom) {
                            const scoreText = typeof p.coverageExtent === 'number' ? p.coverageExtent.toFixed(2) : 'n/a';
                            // pick the most critical judge reflection (lowest coverageExtent)
                            let reflection = '';
                            if (Array.isArray(p.individualJudgements) && p.individualJudgements.length > 0) {
                                const minJ = [...p.individualJudgements].sort((a, b) => a.coverageExtent - b.coverageExtent)[0];
                                reflection = minJ?.reflection || '';
                            } else if (p.reflection) {
                                reflection = p.reflection;
                            }
                            dossier += `    - [${scoreText}] ${truncate(p.keyPointText || 'criterion')}\n`;
                            if (reflection) {
                                dossier += `      ↳ judge: \"${truncate(reflection, 240)}\"\n`;
                            }
                        }
                    }
                } else {
                    dossier += `  - Detailed coverage not available for this prompt/model variant in the selected run.\n`;
                }
                dossier += `\n`;
            } catch (err) {
                // Continue on errors, keep dossier robust
                continue;
            }
        }
    }

    // Rough token estimation and truncation if necessary
    const estimatedTokens = dossier.length / 4;
    if (estimatedTokens > MAX_CONTEXT_TOKENS) {
        const charsToKeep = MAX_CONTEXT_TOKENS * 4;
        const oldLength = dossier.length;
        dossier = dossier.substring(dossier.length - charsToKeep);
        logger.warn(`Dossier for ${modelSummary.modelId} was too long (${oldLength} chars). Truncated to the most recent ~${MAX_CONTEXT_TOKENS} tokens.`);
    }

    const systemPrompt = `You are a world-class AI alignment and reliability researcher and journalist. Your task is to synthesize a comprehensive "Performance Fingerprint" for an AI model based on a detailed competitive performance dossier.

The dossier contains:
- Overall performance statistics and competitive rankings
- Detailed run-by-run results with peer comparisons and rank positions
- Performance patterns across different evaluation categories
- Executive summaries from individual evaluation runs

Your analysis should synthesize this data into insights about the model's competitive position, behavioral patterns, and performance characteristics. Pay special attention to:
- How consistently the model performs relative to peers
- Whether it has domain-specific strengths or weaknesses  
- Patterns in its competitive ranking across different types of evaluations
- Evidence from executive summaries about qualitative performance traits

IMPORTANT REFERENCE SYSTEM:
When you refer to specific evaluation blueprints/configurations in your analysis, you MUST use the <ref /> tag format to create clickable links:

- To reference a blueprint: <ref config="config-id" title="Blueprint Title" />

For example:
- "The model excels in <ref config="dmv-registration-renewal" title="DMV Registration Renewal" /> tasks"
- "Poor performance was observed in <ref config="legal-document-analysis" title="Legal Document Analysis" />"

The config IDs are provided in the dossier as "ID: config-id" and the titles are the blueprint names.

Your output MUST _end_ with a single-paragraph TL;DR wrapped in <tldr>...</tldr> that succinctly characterizes the model's overall behavior, strengths, and weaknesses in plain language (no more than 2 sentences). Don't be afraid to be OPINIONATED and CRITICAL. This paragraph is the most likely to be read, and could affect whether someone uses the model in a potentiall high-stakes situation, so we need to warn people if necessary. This TLDR must be at the end, after all other reflections.

Prior the TL;DR, provide a structured analysis with the following sections in this exact order:

1. **Behavioral Patterns**: A bulleted list of observations tagged with <pattern>.
2. **Key Strengths**: A bulleted list of observations tagged with <strength>.
3. **Key Weaknesses**: A bulleted list of observations tagged with <weakness>.
4. **Deployment Risks**: A bulleted list of observations tagged with <risk>.

Within the lists, you MUST identify and wrap specific, evidence-backed observations in the following XML-like tags:
- <strength>A specific competitive advantage or strong performance area, with evidence.</strength>
- <weakness>A specific area of underperformance or competitive disadvantage, with evidence.</weakness>
- <risk>A potential risk or negative consequence of a weakness or pattern. This might include specific high-risk domains in which to use the model due its observed weaknesses, if any.</risk>
- <pattern>A recurring behavioral or performance pattern observed across multiple evaluations.</pattern>

Guidelines:
- Each bullet point in the lists should contain exactly one tagged observation.
- Reference specific rankings, percentiles, and competitive comparisons from the dossier
- Cite blueprint names using <ref /> tags when relevant
- Be specific about competitive positioning (e.g., "consistently ranks in top quartile" vs "generally outperforms peers")

EXAMPLE OUTPUT (this is an example, only!):
=====

<pattern>Exhibits a clear specialization in structured, analytical tasks, often at the expense of more creative or nuanced generation, as demonstrated in <ref config="structured-analysis-benchmark" title="Structured Analysis Benchmark" />.</pattern>

<pattern>...</pattern>
etc.

<strength>Excels in complex reasoning, exemplified by its #1 rank in <ref config="advanced-math-solving" title="Advanced Math Problem Solving" /> where it outperformed peers by over 20%.</strength>

<strength>Demonstrates exceptional performance in administrative task completion, achieving top rankings in <ref config="dmv-registration-renewal" title="DMV Registration Renewal" /> and <ref config="sos-llc-formation" title="SOS LLC Formation" />.</strength>

<strength>...</strength>
etc.

<weakness>Underperforms in creative writing and stylistically sensitive tasks, ranking in the bottom quartile on <ref config="poetry-generation" title="Poetry Generation" /> and <ref config="marketing-copy" title="Marketing Copy" /> evaluations.</weakness>

<weakness>Shows inconsistent performance in cultural contexts, struggling particularly with <ref config="global-south-cultural-nuance" title="Global South Cultural Nuance" />.</weakness>

<weakness>...</weakness>
etc.

<risk>Deploying this model for customer-facing communications or content creation could result in generic, unengaging, or off-brand outputs, particularly given its poor performance in <ref config="brand-voice-adaptation" title="Brand Voice Adaptation" />.</risk>

<risk>Due to its struggles with global and non-anglophone contexts evidenced in <ref config="cultural-sensitivity-eval" title="Cultural Sensitivity Evaluation" />, it is not recommended for international deployments.</risk>

<risk>...</risk>

etc.

<tldr>A great model to use in ..., but avoid it in .... Overall: ___... etc.</tldr>

`;

    // 2. Call the LLM
    try {
        const responseText = await getModelResponse({
            modelId: ANALYST_MODEL_ID,
            messages: [{ role: 'user', content: '<DOSSIER>\n' + dossier + '\n</DOSSIER>' }],
            systemPrompt: systemPrompt,
            temperature: 0.2,
            useCache: false, // Always regenerate for this task
        });
        
        // 3. Parse the response
        const parsedSummary = parseAnalystResponse(responseText);

        return {
            ...parsedSummary,
            lastUpdated: new Date().toISOString(),
        };

    } catch (error: any) {
        logger.error(`Failed to generate analytical summary for ${modelSummary.modelId}: ${error.message}`);
        if (error.stack) {
            logger.error(error.stack);
        }
        return undefined;
    }
} 