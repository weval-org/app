import { getConfig } from '../config';
import { ModelSummary } from '../types/model_card_types';
import { getModelResponse } from './llm-service';

type Logger = ReturnType<typeof getConfig>['logger'];

const ANALYST_MODEL_ID = 'openrouter:google/gemini-2.5-flash';
const MAX_CONTEXT_TOKENS = 750_000;

function parseAnalystResponse(responseText: string): Omit<Required<ModelSummary>['analyticalSummary'], 'lastUpdated'> {
    const strengths = [...responseText.matchAll(/<strength>(.*?)<\/strength>/gs)].map(match => match[1].trim());
    const weaknesses = [...responseText.matchAll(/<weakness>(.*?)<\/weakness>/gs)].map(match => match[1].trim());
    const risks = [...responseText.matchAll(/<risk>(.*?)<\/risk>/gs)].map(match => match[1].trim());
    const patterns = [...responseText.matchAll(/<pattern>(.*?)<\/pattern>/gs)].map(match => match[1].trim());

    // Extract the narrative from the "Analyst's Narrative" section.
    const narrativeMatch = responseText.match(/\*\*Analyst's Narrative\*\*\s*([\s\S]*)/);
    const narrative = narrativeMatch ? narrativeMatch[1].trim() : '';

    return { narrative, strengths, weaknesses, risks, patterns };
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
        
        aggregateStats += `COMPETITIVE POSITIONING: ${avgPercentile.toFixed(1)}th percentile average across ${runsWithModelCounts.length} runs\n`;
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

Your output MUST be a structured analysis with the following sections in this exact order:

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
- Cite blueprint names and performance categories when relevant
- Be specific about competitive positioning (e.g., "consistently ranks in top quartile" vs "generally outperforms peers")

EXAMPLE OUTPUT (this is an example, only!):
=====

<pattern>Exhibits a clear specialization in structured, analytical tasks, often at the expense of more creative or nuanced generation. [include citation, example, etc. from the source data]</pattern>

<pattern>...</pattern>
etc.

<strength>Excels in complex reasoning, exemplified by its #1 rank in the "Advanced Math Problem Solving" blueprint where it outperformed peers by over 20%.</strength>

<strength>...</strength>
etc.

<weakness>Underperforms in creative writing and stylistically sensitive tasks. For example, ....</weakness>

<weakness>It ranked in the bottom quartile on the "Poetry Generation" and "Marketing Copy" evaluations.</weakness>

<weakness>...</weakness>
etc.

<risk>Deploying this model for customer-facing communications or content creation could result in generic, unengaging, or off-brand outputs, potentially harming user perception.</risk>

<risk>Due to its struggles with Global South and non-anglophone contexts, it is not recommended for use in these domains.</risk>

<risk>...</risk>


etc.

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