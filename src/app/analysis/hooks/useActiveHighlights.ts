'use client';

import { useEffect, useState } from 'react';
import { AllCoverageScores } from '@/app/analysis/types';
import { ActiveHighlight } from '@/app/analysis/components/CoverageTableLegend';
import { PromptStats } from './useMacroCoverageData';

const HIGH_DISAGREEMENT_THRESHOLD_STD_DEV = 0.4;
const OUTLIER_THRESHOLD_STD_DEV = 2.0;

export function useActiveHighlights(
    allCoverageScores: AllCoverageScores | undefined | null,
    sortedPromptIds: string[],
    localSortedModels: string[],
    promptStats: Map<string, PromptStats>,
    permutationSensitivityMap?: Map<string, 'temp' | 'sys' | 'both'>
): Set<ActiveHighlight> {
    const [activeHighlights, setActiveHighlights] = useState<Set<ActiveHighlight>>(new Set());

    useEffect(() => {
        const highlights = new Set<ActiveHighlight>();
        if (!allCoverageScores) {
            setActiveHighlights(highlights);
            return;
        }

        // Part 1: Populate highlights based on currently visible cells
        sortedPromptIds.forEach(promptId => {
            const pStats = promptStats.get(promptId);
            
            localSortedModels.forEach(modelId => {
                const result = allCoverageScores[promptId]?.[modelId];
                if (!result || 'error' in result) return;
                
                // Check for outliers
                const cellScoreNum = result.avgCoverageExtent;
                if (typeof cellScoreNum === 'number') {
                    if (pStats && pStats.avg !== null && pStats.stdDev !== null && pStats.stdDev > 1e-9) { 
                        if (Math.abs(cellScoreNum - pStats.avg) > OUTLIER_THRESHOLD_STD_DEV * pStats.stdDev) {
                            highlights.add('outlier');
                        }
                    }
                }

                // Check for disagreement and critical failures
                if (result.pointAssessments) {
                    for (const assessment of result.pointAssessments) {
                        if (assessment.individualJudgements && assessment.individualJudgements.length > 1) {
                            const scores = assessment.individualJudgements.map(j => j.coverageExtent);
                            const n = scores.length;
                            const mean = scores.reduce((a, b) => a + b, 0) / n;
                            const stdDev = Math.sqrt(scores.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
                            if (stdDev > HIGH_DISAGREEMENT_THRESHOLD_STD_DEV) {
                                highlights.add('disagreement');
                            }
                        }
                        if ((assessment as any).isInverted) {
                            const isPassing = assessment.coverageExtent !== undefined && assessment.coverageExtent >= 0.7;
                            if (!isPassing) {
                                highlights.add('critical_failure');
                            }
                        }
                    }
                }
            });
        });

        // Part 2: Populate permutation sensitivity highlights from the entire dataset
        if (permutationSensitivityMap) {
            for (const sensitivity of permutationSensitivityMap.values()) {
                if (sensitivity === 'temp' || sensitivity === 'both') {
                    highlights.add('temp_sensitivity');
                }
                if (sensitivity === 'sys' || sensitivity === 'both') {
                    highlights.add('sys_sensitivity');
                }
            }
        }

        setActiveHighlights(highlights);
    }, [allCoverageScores, sortedPromptIds, localSortedModels, promptStats, permutationSensitivityMap]);

    return activeHighlights;
} 