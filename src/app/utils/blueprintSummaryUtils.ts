import { EnhancedComparisonConfigInfo, EnhancedRunInfo, AllCoverageScores } from './homepageDataUtils';
import { getModelDisplayLabel, parseModelIdForDisplay } from './modelIdUtils';
import { IDEAL_MODEL_ID } from './calculationUtils';
import { fromSafeTimestamp } from '@/lib/timestampUtils';

export interface BlueprintSummaryInfo extends EnhancedComparisonConfigInfo {
  latestInstanceTimestamp: string | null;
  uniqueRunLabelCount: number;
  latestRunActualLabel: string | null;
  latestRunSafeTimestamp: string | null;
  bestOverallModel: { name: string; score: number; displayName: string } | null;
  latestRunCoverageScores?: AllCoverageScores | null;
  latestRunModels?: string[];
  latestRunPromptIds?: string[];
}

export function processBlueprintSummaries(configs: EnhancedComparisonConfigInfo[]): BlueprintSummaryInfo[] {
    const blueprintSummaries: BlueprintSummaryInfo[] = configs.map(config => {
        let latestInstanceTimestamp: string | null = null;
        let latestRunActualLabel: string | null = null;
        let latestRunSafeTimestampForUrl: string | null = null;
        let latestRun: EnhancedRunInfo | null = null;

        if (config.runs && config.runs.length > 0) {
            let latestDateObj: Date | null = null;

            for (const run of config.runs) {
                if (run.timestamp && run.runLabel) {
                    const currentDateObj = new Date(fromSafeTimestamp(run.timestamp));
                    if (!isNaN(currentDateObj.getTime())) {
                        if (!latestDateObj || currentDateObj.getTime() > latestDateObj.getTime()) {
                            latestDateObj = currentDateObj;
                            latestRun = run;
                        }
                    }
                }
            }

            if (latestRun && latestDateObj) {
                latestInstanceTimestamp = latestDateObj.toISOString();
                latestRunActualLabel = latestRun.runLabel;
                latestRunSafeTimestampForUrl = latestRun.timestamp;
            }
        }

        const uniqueRunLabels = new Set(config.runs.map(r => r.runLabel).filter(Boolean));
        
        const latestRunCoverageScores = latestRun?.allCoverageScores;
        const latestRunModels = latestRun?.models;
        const latestRunPromptIds = latestRunCoverageScores ? Object.keys(latestRunCoverageScores) : [];

        let bestOverallModelData: { name: string; score: number; displayName: string } | null = null;
        if (config.runs && config.runs.length > 0) {
            const allModelScoresAcrossRuns = new Map<string, { scoreSum: number; count: number }>();

            config.runs.forEach(run => {
                if (run.perModelScores) {
                    const scoresMap = run.perModelScores instanceof Map
                        ? run.perModelScores
                        : new Map(Object.entries(run.perModelScores || {}) as [string, any][]);

                    scoresMap.forEach((scoreData: any, modelId: string) => {
                        const hybridScore = scoreData.hybrid?.average || scoreData.average; // Support both new and old formats
                        if (modelId !== IDEAL_MODEL_ID && hybridScore !== null && hybridScore !== undefined) {
                            const current = allModelScoresAcrossRuns.get(modelId) || { scoreSum: 0, count: 0 };
                            current.scoreSum += hybridScore;
                            current.count++;
                            allModelScoresAcrossRuns.set(modelId, current);
                        }
                    });
                }
            });

            let bestOverallScore = -Infinity;
            let bestModelId: string | null = null;

            allModelScoresAcrossRuns.forEach((data, modelId) => {
                const avgScore = data.scoreSum / data.count;
                if (avgScore > bestOverallScore) {
                    bestOverallScore = avgScore;
                    bestModelId = modelId;
                }
            });

            if (bestModelId) {
                bestOverallModelData = {
                    name: bestModelId,
                    score: bestOverallScore,
                    displayName: getModelDisplayLabel(bestModelId, {hideProvider:true})
                };
            }
        }

        return {
            ...config,
            latestInstanceTimestamp,
            uniqueRunLabelCount: uniqueRunLabels.size,
            latestRunActualLabel,
            latestRunSafeTimestamp: latestRunSafeTimestampForUrl,
            bestOverallModel: bestOverallModelData,
            latestRunCoverageScores,
            latestRunModels,
            latestRunPromptIds,
        };
    });

    blueprintSummaries.sort((a, b) => {
        const tsA = a.latestInstanceTimestamp;
        const tsB = b.latestInstanceTimestamp;

        if (!tsA) return 1;
        if (!tsB) return -1;
        return new Date(tsB).getTime() - new Date(tsA).getTime();
    });

    return blueprintSummaries;
} 