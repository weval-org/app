/**
 * This file contains the core logic for the llm-coverage evaluator, separated for clarity and testability.
 */

import { PointAssessment } from '@/types/shared';
import { NormalizedPoint } from '../types/cli_types';
import * as pointFunctions from '@/point-functions';
import { PointFunctionReturn, PointFunctionContext } from '@/point-functions/types';
import { getConfig } from '../config';

type Logger = ReturnType<typeof getConfig>['logger'];

/**
 * Aggregates a list of point assessments into a final average score.
 * @param assessments The list of individual point assessments.
 * @returns The average coverage extent, weighted by multipliers.
 */
export function aggregateCoverageScores(assessments: PointAssessment[]): number {
    if (assessments.length === 0) {
        return 0;
    }

    let totalWeightedScore = 0;
    let totalMultiplier = 0;

    for (const assessment of assessments) {
        if (assessment.coverageExtent !== undefined) {
            const multiplier = assessment.multiplier ?? 1;
            totalWeightedScore += assessment.coverageExtent * multiplier;
            totalMultiplier += multiplier;
        }
    }

    if (totalMultiplier === 0) {
        return 0;
    }

    return totalWeightedScore / totalMultiplier;
}

/**
 * Creates a PointAssessment object from the result of a point function execution.
 * @param result The result from the point function.
 * @param point The normalized point definition.
 * @returns A PointAssessment object.
 */
function createAssessmentFromResult(result: PointFunctionReturn, point: NormalizedPoint): PointAssessment {
    let score: number | undefined;
    let error: string | undefined;

    if (typeof result === 'boolean') {
        score = result ? 1.0 : 0.0;
    } else if (typeof result === 'number') {
        score = Math.max(0, Math.min(1, result));
    } else if (typeof result === 'object' && result !== null && 'error' in result) {
        error = result.error;
    } else {
        error = `Invalid return value from point function: ${JSON.stringify(result)}`;
    }

    if (score !== undefined && point.isInverted) {
        score = 1.0 - score;
    }

    return {
        keyPointText: point.displayText,
        coverageExtent: score,
        multiplier: point.multiplier,
        citation: point.citation,
        isInverted: point.isInverted,
        reflection: error ? undefined : `Function '${point.functionName}' evaluated to ${score?.toFixed(2)}.`,
        error: error,
    };
}

function createErrorAssessment(errorMessage: string, point: NormalizedPoint): PointAssessment {
    return {
        keyPointText: point.displayText,
        error: errorMessage,
        coverageExtent: undefined,
        reflection: `Error: ${errorMessage}`,
        multiplier: point.multiplier,
        citation: point.citation,
        isInverted: point.isInverted,
    };
}

/**
 * Evaluates a set of function-based points against a model's response.
 * @param functionPoints The normalized function-based points to evaluate.
 * @param responseText The text of the model's response.
 * @param context The context for the evaluation, including config and prompt info.
 * @returns A promise that resolves to an array of PointAssessment objects.
 */
export async function evaluateFunctionPoints(
    functionPoints: NormalizedPoint[],
    responseText: string,
    context: PointFunctionContext
): Promise<PointAssessment[]> {
    const assessments: PointAssessment[] = [];
    for (const point of functionPoints) {
        if (!point.isFunction || !point.functionName) continue;

        const pointFn = pointFunctions.pointFunctions[point.functionName];
        if (pointFn) {
            try {
                const result = await Promise.resolve(pointFn(
                    responseText,
                    point.functionArgs,
                    context
                ));
                assessments.push(createAssessmentFromResult(result, point));
            } catch (error: any) {
                assessments.push(createErrorAssessment(`Error executing point function '${point.functionName}': ${error.message}`, point));
            }
        } else {
            const fn = (pointFunctions as any)[point.functionName];
            if (typeof fn !== 'function') {
                const errorMessage = `Unknown point function: '${point.functionName}'`;
                context.logger?.warn(`[CoverageLogic] Function '${point.functionName}' not found for point: "${point.displayText}".`);
                assessments.push(createErrorAssessment(errorMessage, point));
                continue;
            }
        }
    }
    return assessments;
} 