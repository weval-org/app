import {
    ComparisonDataV2,
    CoverageResult,
    PointAssessment,
} from '@/app/utils/types';
import {
    ConversationMessage
} from '@/types/shared';
import {
    IDEAL_MODEL_ID,
    calculateAverageSimilarity,
    findSimilarityExtremes,
    calculateOverallCoverageExtremes,
    calculateHybridScoreExtremes,
    calculateOverallAverageCoverage,
    calculatePerModelHybridScoresForRun, 
    calculateAverageHybridScoreForRun,
    findIdealExtremes
} from '@/app/utils/calculationUtils';
import { fromSafeTimestamp, formatTimestampForDisplay } from '@/lib/timestampUtils';
import { getModelDisplayLabel, parseEffectiveModelId } from './modelIdUtils';

function escapeMarkdown(text: string): string {
    if (!text) return text;
    // Escape characters that have special meaning in Markdown to prevent formatting issues.
    return text
      .replace(/\\/g, '\\\\') // must be first
      .replace(/\|/g, '\\|')
      .replace(/`/g, '\\`')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\{/g, '\\{')
      .replace(/}/g, '\\}')
      .replace(/\[/g, '\\[')
      .replace(/]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
}

function calculatePerModelSemanticScoresForRun(
    perPromptSimilarities: Record<string, Record<string, Record<string, number>>>,
    modelIds: string[],
    promptIds: string[],
    idealModelId: string
): Map<string, { average: number | null; stddev: number | null }> {
    const perModelScores = new Map<string, number[]>();

    for (const modelId of modelIds) {
        if (modelId === idealModelId) continue;

        const scores: number[] = [];
        for (const promptId of promptIds) {
            const promptSims = perPromptSimilarities[promptId];
            if (promptSims && promptSims[modelId] && typeof promptSims[modelId][idealModelId] === 'number') {
                scores.push(promptSims[modelId][idealModelId]);
            }
        }
        if (scores.length > 0) {
            perModelScores.set(modelId, scores);
        }
    }

    const perModelStats = new Map<string, { average: number | null; stddev: number | null }>();
    for (const [modelId, scores] of perModelScores.entries()) {
        if (scores.length > 0) {
            const sum = scores.reduce((a, b) => a + b, 0);
            const average = sum / scores.length;
            const stddev = Math.sqrt(scores.map(x => Math.pow(x - average, 2)).reduce((a, b) => a + b, 0) / scores.length);
            perModelStats.set(modelId, { average, stddev });
        } else {
            perModelStats.set(modelId, { average: null, stddev: null });
        }
    }
    return perModelStats;
}

function calculateAllRunStats(data: ComparisonDataV2) {
    const { evaluationResults, effectiveModels, promptIds } = data;

    const stats: any = {
        overallIdealExtremes: null,
        overallAvgCoverageStats: null,
        overallCoverageExtremes: null,
        overallHybridExtremes: null,
        overallAverageHybridScore: null,
        overallHybridScoreStdDev: null,
        calculatedPerModelHybridScores: new Map(),
        calculatedPerModelSemanticScores: new Map(),
    };

    if (!effectiveModels) {
        return stats;
    }

    if (evaluationResults?.similarityMatrix) {
        stats.overallIdealExtremes = findIdealExtremes(evaluationResults.similarityMatrix, IDEAL_MODEL_ID);
    }

    const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, CoverageResult>> | undefined;

    if (llmCoverageScores && promptIds) {
        stats.overallCoverageExtremes = calculateOverallCoverageExtremes(llmCoverageScores, effectiveModels);
        stats.overallAvgCoverageStats = calculateOverallAverageCoverage(llmCoverageScores, effectiveModels, promptIds);
    }

    if (evaluationResults?.perPromptSimilarities && llmCoverageScores && promptIds) {
        stats.overallHybridExtremes = calculateHybridScoreExtremes(
            evaluationResults.perPromptSimilarities,
            llmCoverageScores,
            effectiveModels,
            IDEAL_MODEL_ID
        );
        const hybridStats = calculateAverageHybridScoreForRun(
            evaluationResults.perPromptSimilarities,
            llmCoverageScores,
            effectiveModels,
            promptIds,
            IDEAL_MODEL_ID
        );
        stats.overallAverageHybridScore = hybridStats?.average ?? null;
        stats.overallHybridScoreStdDev = hybridStats?.stddev ?? null;
    }
    
    if (data.evaluationResults?.perModelHybridScores) {
        let scoresToSet = data.evaluationResults.perModelHybridScores;
        if (typeof scoresToSet === 'object' && !(scoresToSet instanceof Map)) {
            scoresToSet = new Map(Object.entries(scoresToSet));
        }
        stats.calculatedPerModelHybridScores = scoresToSet;
    } else if (evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels && promptIds) {
        stats.calculatedPerModelHybridScores = calculatePerModelHybridScoresForRun(
            evaluationResults.perPromptSimilarities,
            llmCoverageScores,
            effectiveModels,
            promptIds,
            IDEAL_MODEL_ID
        );
    }
    
    if (data.evaluationResults?.perModelSemanticScores) {
        let scoresToSet = data.evaluationResults.perModelSemanticScores;
        if (typeof scoresToSet === 'object' && !(scoresToSet instanceof Map)) {
            scoresToSet = new Map(Object.entries(scoresToSet));
        }
        stats.calculatedPerModelSemanticScores = scoresToSet;
    } else if (evaluationResults?.perPromptSimilarities && effectiveModels && promptIds) {
         stats.calculatedPerModelSemanticScores = calculatePerModelSemanticScoresForRun(
            evaluationResults.perPromptSimilarities,
            effectiveModels,
            promptIds,
            IDEAL_MODEL_ID
        );
    }
    
    return stats;
}

function formatConversation(messages: ConversationMessage[] | string): string {
    if (typeof messages === 'string') {
        // User-provided prompt string, no need to escape.
        return `**User:**\n\n> ${messages.replace(/\n/g, '\n> ')}`;
    }
    if (Array.isArray(messages)) {
        return messages.map(m => {
            // Only escape assistant-generated content to prevent breaking markdown.
            const content = m.role === 'assistant' ? escapeMarkdown(m.content) : m.content;
            return `**${m.role.charAt(0).toUpperCase() + m.role.slice(1)}:**\n\n> ${content.replace(/\n/g, '\n> ')}`;
        }).join('\n\n---\n\n');
    }
    return "Invalid conversation format";
}

function formatPoints(points: any[] | undefined): string {
    if (!points || points.length === 0) return "> _No key points defined._";
    return points.map(p => {
        if (typeof p === 'string') return `*   ${p}`;
        if (Array.isArray(p)) return `*   Function: \`${p[0]}\`, Args: \`${JSON.stringify(p[1])}\``;
        if (typeof p === 'object') {
            const text = p.text ? `"${p.text}"` : `Function: \`${p.fn}\`, Args: \`${JSON.stringify(p.fnArgs)}\``;
            return `*   ${text} (Multiplier: ${p.multiplier || 1})`;
        }
        return '';
    }).join('\n');
}

function formatPointAssessments(assessments: PointAssessment[] | undefined): string {
    if (!assessments) return "No assessment data.";
    if (assessments.length === 0) return "No points to assess.";

    let table = "| Key Point | Score | Reflection |\n";
    table += "|:---|:---:|:---|\n";
    
    assessments.forEach((a: PointAssessment) => {
        const pointText = (a.keyPointText || 'N/A').replace(/\n/g, ' ').replace(/\|/g, '\\|');
        const score = typeof a.coverageExtent === 'number' ? a.coverageExtent.toFixed(4) : 'N/A';
        // For reflections in tables, escape markdown and replace newlines with spaces to keep table structure.
        const reflection = escapeMarkdown(a.reflection || '_No reflection provided._').replace(/\n/g, ' ');
        table += `| ${pointText} | ${score} | ${reflection} |\n`;
    });
    return table;
}

interface MarkdownGenerationOptions {
    truncateLength?: number;
}

export async function generateRunMarkdown(data: ComparisonDataV2, options: MarkdownGenerationOptions = {}): Promise<string> {
    const { truncateLength } = options;
    const stats = calculateAllRunStats(data);
    const {
        configTitle,
        runLabel,
        timestamp,
        description,
        config,
        promptIds,
        effectiveModels,
        promptContexts,
        allFinalAssistantResponses,
        evaluationResults,
        extractedKeyPoints
    } = data;

    const modelsToDisplay = effectiveModels.filter(m => m !== IDEAL_MODEL_ID);

    let md = `# Evaluation Report: ${configTitle || data.configId}\n\n`;
    md += `**Run Label:** \`${runLabel}\`\n`;
    md += `**Timestamp:** ${formatTimestampForDisplay(fromSafeTimestamp(timestamp))}\n`;
    if (description) md += `**Description:** ${description}\n`;
    if (config?.tags && config.tags.length > 0) md += `**Tags:** ${config.tags.map(t => `\`${t}\``).join(', ')}\n`;

    if (truncateLength) {
        md += `\n**Note:** All model responses in this report have been truncated to a maximum of ${truncateLength} characters.\n`;
    }

    md += "\n---\n\n";

    md += "## 📈 Overall Run Statistics\n\n";

    md += `*   **Prompts Evaluated:** ${promptIds?.length || 0}\n`;
    md += `*   **Models Compared:** ${modelsToDisplay?.length || 0}\n\n`;

    if (stats.overallAverageHybridScore !== null) {
        md += `*   **Overall Average Hybrid Score:** ${stats.overallAverageHybridScore.toFixed(4)} (StdDev: ${stats.overallHybridScoreStdDev.toFixed(4)})\n`;
    }
    if (stats.overallAvgCoverageStats?.average !== null) {
        md += `*   **Overall Average Key Point Coverage:** ${stats.overallAvgCoverageStats.average.toFixed(4)} (StdDev: ${stats.overallAvgCoverageStats.stddev.toFixed(4)})\n`;
    }

    md += "\n### Performance Extremes\n\n";

    let extremesTable = "| Metric | Best Performer | Score | Worst Performer | Score |\n";
    extremesTable += "|:---|:---|:---:|:---|:---:|\n";

    const semExt = stats.overallIdealExtremes;
    if (semExt?.mostSimilar?.modelId && typeof semExt.mostSimilar.score === 'number' &&
        semExt?.leastSimilar?.modelId && typeof semExt.leastSimilar.score === 'number') {
        extremesTable += `| **Semantic Similarity to Ideal** | \`${getModelDisplayLabel(semExt.mostSimilar.modelId)}\` | ${semExt.mostSimilar.score.toFixed(4)} | \`${getModelDisplayLabel(semExt.leastSimilar.modelId)}\` | ${semExt.leastSimilar.score.toFixed(4)} |\n`;
    }

    const covExt = stats.overallCoverageExtremes;
    if (covExt?.bestCoverage?.modelId && typeof covExt.bestCoverage.score === 'number' &&
        covExt?.worstCoverage?.modelId && typeof covExt.worstCoverage.score === 'number') {
        extremesTable += `| **Key Point Coverage** | \`${getModelDisplayLabel(covExt.bestCoverage.modelId)}\` | ${covExt.bestCoverage.score.toFixed(4)} | \`${getModelDisplayLabel(covExt.worstCoverage.modelId)}\` | ${covExt.worstCoverage.score.toFixed(4)} |\n`;
    }

    const hybExt = stats.overallHybridExtremes;
    if (hybExt?.bestHybrid?.modelId && typeof hybExt.bestHybrid.score === 'number' &&
        hybExt?.worstHybrid?.modelId && typeof hybExt.worstHybrid.score === 'number') {
        extremesTable += `| **Hybrid Score (Similarity + Coverage)** | \`${getModelDisplayLabel(hybExt.bestHybrid.modelId)}\` | ${hybExt.bestHybrid.score.toFixed(4)} | \`${getModelDisplayLabel(hybExt.worstHybrid.modelId)}\` | ${hybExt.worstHybrid.score.toFixed(4)} |\n`;
    }
    
    md += extremesTable;

    md += "\n\n### Per-Model Average Scores\n\n";
    let scoresTable = "| Model | Avg. Hybrid Score | Avg. Semantic Score |\n";
    scoresTable += "|:---|:---:|:---:|\n";

    const sortedModels = [...stats.calculatedPerModelHybridScores.entries()].sort((a: [string, any], b: [string, any]) => (b[1]?.average ?? 0) - (a[1]?.average ?? 0));

    for (const [modelId, hybridStats] of sortedModels) {
        const semanticStats = stats.calculatedPerModelSemanticScores.get(modelId);
        scoresTable += `| \`${getModelDisplayLabel(modelId)}\` | ${(hybridStats as any)?.average?.toFixed(4) ?? 'N/A'} | ${semanticStats?.average?.toFixed(4) ?? 'N/A'} |\n`;
    }
    md += scoresTable;

    md += "\n---\n\n";

    md += "## 🤖 Prompt-by-Prompt Analysis\n\n";

    if (!promptIds || !promptContexts || !allFinalAssistantResponses) {
        md += "> _No detailed prompt data available._\n";
    } else {
        for (const promptId of promptIds) {
            md += `### Prompt: \`${promptId}\`\n\n`;
            
            md += "#### Context\n\n";
            // The fullConversationHistories contains the definitive record of messages sent to the model,
            // including any prepended system prompts. We take the history from the first available model
            // and slice off the last message (the assistant's reply) to get the input context.
            const firstModelId = modelsToDisplay[0];
            const conversationHistoryForContext = allFinalAssistantResponses[promptId]?.[firstModelId] && data.fullConversationHistories?.[promptId]?.[firstModelId];
            const initialMessagesForContext = conversationHistoryForContext 
                ? conversationHistoryForContext.slice(0, -1) // All but the last message (the assistant's reply)
                : promptContexts[promptId]; // Fallback to old way if history is not available

            md += formatConversation(initialMessagesForContext);
            md += "\n\n";

            const idealResponse = allFinalAssistantResponses[promptId]?.[IDEAL_MODEL_ID];
            if (idealResponse) {
                let displayIdealResponse = idealResponse;
                if (truncateLength && displayIdealResponse.length > truncateLength) {
                    displayIdealResponse = displayIdealResponse.substring(0, truncateLength) + `... [truncated, full length: ${idealResponse.length}]`;
                }
                md += `#### Ideal Response\n\n> ${escapeMarkdown(displayIdealResponse).replace(/\n/g, '\n> ')}\n\n`;
            }

            const points = extractedKeyPoints?.[promptId] || config.prompts.find(p => p.id === promptId)?.points;
            if (points) {
                md += `#### Key Points for Evaluation\n\n${formatPoints(points)}\n\n`;
            }

            md += "#### Model Responses & Assessments\n\n";
            
            for (const modelId of modelsToDisplay) {
                let response = allFinalAssistantResponses[promptId]?.[modelId] || "_Response not found._";
                const originalLength = response.length;
                const llmCoverageResult = evaluationResults?.llmCoverageScores?.[promptId]?.[modelId];

                md += `<details>\n<summary><strong>${getModelDisplayLabel(modelId)}</strong></summary>\n\n`;
                
                if (truncateLength && response.length > truncateLength) {
                    response = response.substring(0, truncateLength) + `... [truncated, full length: ${originalLength}]`;
                }

                md += `**Response:**\n\n> ${escapeMarkdown(response).replace(/\n/g, '\n> ')}\n\n`;
                
                md += "**Scores:**\n";
                const semanticScore = evaluationResults?.perPromptSimilarities?.[promptId]?.[modelId]?.[IDEAL_MODEL_ID];
                md += `*   **Semantic Similarity to Ideal:** ${semanticScore != null ? semanticScore.toFixed(4) : 'N/A'}\n`;

                if (llmCoverageResult && !('error' in llmCoverageResult)) {
                    let weightedAverageScore: number | undefined = undefined;
                    if (llmCoverageResult.pointAssessments) {
                        const assessments = llmCoverageResult.pointAssessments as any[];
                        let totalScore = 0;
                        let totalWeight = 0;
                        assessments.forEach(a => {
                            const weight = a.multiplier || 1;
                            if (typeof a.coverageExtent === 'number') {
                                totalScore += a.coverageExtent * weight;
                                totalWeight += weight;
                            }
                        });
                        if (totalWeight > 0) {
                            weightedAverageScore = totalScore / totalWeight;
                        }
                    }
                    md += `*   **Key Point Coverage Score:** ${weightedAverageScore != null ? weightedAverageScore.toFixed(4) : 'N/A'}\n\n`;
                    md += `**Coverage Breakdown:**\n\n`;
                    md += formatPointAssessments(llmCoverageResult.pointAssessments);
                    md += "\n";
                } else if (llmCoverageResult && 'error' in llmCoverageResult) {
                     md += `*   **Key Point Coverage Score:** Error\n`;
                     md += `> _Error during coverage assessment: ${escapeMarkdown(llmCoverageResult.error)}_\n\n`;
                } else {
                     md += `*   **Key Point Coverage Score:** N/A\n\n`;
                }
                md += `</details>\n\n`;
            }
        }
    }

    return md;
} 