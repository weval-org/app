'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Type definition for the extremes data (matching the output of calculateHybridScoreExtremes)
interface HybridExtremesData {
    bestHybrid: { modelId: string; avgScore: number } | null;
    worstHybrid: { modelId: string; avgScore: number } | null;
}

interface HybridStatsCardProps {
    data: HybridExtremesData | null;
}

const HybridStatsCard: React.FC<HybridStatsCardProps> = ({ data }) => {
    // Don't render if data is null or both extremes are null
    if (!data || (!data.bestHybrid && !data.worstHybrid)) {
        return null;
    }

    const { bestHybrid, worstHybrid } = data;

    return (
        <Card className="my-6 border-fuchsia-300"> {/* Distinct border color */}
            <CardHeader>
                <CardTitle className="flex items-center">
                    Hybrid Performance Statistics
                </CardTitle>
                <CardDescription>Models ranked by combined semantic similarity and coverage vs ideal.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {/* Best Hybrid Score */}
                    {bestHybrid && (
                        <div className="border p-3 rounded bg-fuchsia-50">
                            <p className="font-medium text-fuchsia-700">Best Hybrid Score (Avg):</p>
                            <p className="text-sm text-fuchsia-600 truncate" title={bestHybrid.modelId}>
                                {bestHybrid.modelId}
                            </p>
                            <p className="text-base font-semibold text-fuchsia-800">
                                Score: {bestHybrid.avgScore.toFixed(3)}
                            </p>
                        </div>
                    )}

                    {/* Worst Hybrid Score */}
                    {worstHybrid && (
                        <div className="border p-3 rounded bg-rose-50">
                            <p className="font-medium text-rose-700">Worst Hybrid Score (Avg):</p>
                            <p className="text-sm text-rose-600 truncate" title={worstHybrid.modelId}>
                                {worstHybrid.modelId}
                            </p>
                            <p className="text-base font-semibold text-rose-800">
                                Score: {worstHybrid.avgScore.toFixed(3)}
                            </p>
                        </div>
                    )}
                </div>
                 {!bestHybrid && !worstHybrid && (
                     <p className="text-muted-foreground text-sm">Hybrid scores could not be calculated (requires per-prompt similarity and coverage data).</p>
                 )}
            </CardContent>
        </Card>
    );
};

export default HybridStatsCard; 