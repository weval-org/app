'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getHybridScoreColorClass } from '@/app/analysis/utils/colorUtils';
import { useAnalysis } from '../context/AnalysisContext';

const SystemPromptsDisplay = () => {
    const { analysisStats, data } = useAnalysis();

    if (!data?.config?.systems || (data.config.systems.length <= 1 && data.config.systems[0] == null)) {
        if (process.env.NODE_ENV === 'development') {
            console.log('[SystemPromptsDisplay] Returning null - condition not met');
        }
        return null;
    }
    
    const systemPrompts = data.config.systems;
    const scores = analysisStats?.perSystemVariantHybridScores;

    return (
        <Card className="shadow-lg border-border dark:border-border">
            <CardHeader>
                <CardTitle className="text-primary text-primary">System Prompt Performance</CardTitle>
                <CardDescription>
                    Average performance for each system prompt variant across all models and prompts.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {systemPrompts.map((systemPrompt, index) => {
                        const score = (scores as Record<number, number | null>)?.[index];
                        const displayPrompt = systemPrompt || "[No System Prompt]";
                        return (
                            <div key={index} className="p-4 rounded-lg border bg-muted/40 flex flex-col">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="font-semibold text-sm text-foreground">Variant {index}</h4>
                                    {score !== null && score !== undefined && (
                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${getHybridScoreColorClass(score)}`}>
                                            {(score * 100).toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground bg-background p-2 rounded-md font-mono whitespace-pre-wrap flex-grow">
                                    {displayPrompt}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
};

export default SystemPromptsDisplay; 