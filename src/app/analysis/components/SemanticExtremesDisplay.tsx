'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { getModelDisplayLabel } from '../../utils/modelIdUtils';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

// Icons
const ArrowUpCircle = dynamic(() => import("lucide-react").then((mod) => mod.ArrowUpCircle));
const ArrowDownCircle = dynamic(() => import("lucide-react").then((mod) => mod.ArrowDownCircle));
const Info = dynamic(() => import("lucide-react").then(mod => mod.Info));

// Define a specific type for the model and score object
interface SemanticExtremeValue {
    id: string;
    score: number;
}

interface SemanticExtremesDisplayProps {
    promptSimilarities: Record<string, Record<string, number>> | undefined | null;
    models: string[]; 
    promptResponses: Record<string, string> | undefined | null;
    idealModelId: string;
    promptId: string;
    onModelClick?: (modelId: string) => void;
}

const SemanticExtremesDisplay: React.FC<SemanticExtremesDisplayProps> = ({
    promptSimilarities,
    models,
    promptResponses,
    idealModelId,
    promptId,
    onModelClick
}) => {
    const semanticExtremes = useMemo<{ 
        mostSimilarModel: SemanticExtremeValue | null; 
        leastSimilarModel: SemanticExtremeValue | null; 
    }>(() => {
        let mostSimilar: SemanticExtremeValue | null = null;
        let leastSimilar: SemanticExtremeValue | null = null;

        if (!promptSimilarities || !models || models.length === 0 || !idealModelId) {
            return { mostSimilarModel: null, leastSimilarModel: null };
        }

        let maxSim = -Infinity;
        let minSim = Infinity;

        models.forEach(modelId => {
            if (modelId === idealModelId) return;

            const idealSims = promptSimilarities[idealModelId];
            const modelSims = promptSimilarities[modelId];
            let currentSim: number | undefined = undefined;

            if (idealSims && idealSims[modelId] !== undefined && !isNaN(idealSims[modelId])) {
                currentSim = idealSims[modelId];
            } else if (modelSims && modelSims[idealModelId] !== undefined && !isNaN(modelSims[idealModelId])) {
                currentSim = modelSims[idealModelId];
            }
            
            if (currentSim !== undefined) {
                if (currentSim > maxSim) {
                    maxSim = currentSim;
                    mostSimilar = { id: modelId, score: currentSim };
                }
                if (currentSim < minSim) {
                    minSim = currentSim;
                    leastSimilar = { id: modelId, score: currentSim };
                }
            }
        });

        if (mostSimilar && leastSimilar) {
            if ((mostSimilar as SemanticExtremeValue).id === (leastSimilar as SemanticExtremeValue).id) {
                leastSimilar = null; 
            }
        }

        return { mostSimilarModel: mostSimilar, leastSimilarModel: leastSimilar };
    }, [promptSimilarities, models, idealModelId]);

    const mostSimilarModelInfo = useMemo(() => {
        const currentMostSimilar = semanticExtremes.mostSimilarModel;
        if (!currentMostSimilar || !promptResponses) return null;
        // Assert type after guard clause
        const modelData = currentMostSimilar as SemanticExtremeValue;
        return {
            id: modelData.id,
            displayLabel: getModelDisplayLabel(modelData.id), 
            response: promptResponses[modelData.id] || 'Response not found.',
            score: modelData.score,
        };
    }, [semanticExtremes.mostSimilarModel, promptResponses]);

    const leastSimilarModelInfo = useMemo(() => {
        const currentLeastSimilar = semanticExtremes.leastSimilarModel;
        if (!currentLeastSimilar || !promptResponses) return null;
        // Assert type after guard clause
        const modelData = currentLeastSimilar as SemanticExtremeValue;
        return {
            id: modelData.id,
            displayLabel: getModelDisplayLabel(modelData.id),
            response: promptResponses[modelData.id] || 'Response not found.',
            score: modelData.score,
        };
    }, [semanticExtremes.leastSimilarModel, promptResponses]);

    const availableModelsForComparison = models.filter(m => m !== idealModelId);

    if (availableModelsForComparison.length === 0 && (!mostSimilarModelInfo && !leastSimilarModelInfo)) {
         return null; 
    }

    if ((!mostSimilarModelInfo && !leastSimilarModelInfo) && availableModelsForComparison.length > 0) {
        return (
            <Card className="bg-muted/30 dark:bg-slate-800/30 border-dashed border-border dark:border-slate-700/70 text-muted-foreground dark:text-slate-500 my-4">
                <CardHeader className='py-2.5 px-3.5'>
                    <CardTitle className="text-sm text-muted-foreground dark:text-slate-400 flex items-center">
                        {Info && <Info className="w-4 h-4 mr-2" />} Semantic Extremes vs. Ideal
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 pb-3 px-3.5">
                    <p className="text-xs italic">
                        No semantic similarity scores to Ideal found for models on prompt: <span className="font-semibold not-italic">{promptId}</span>.
                    </p>
                </CardContent>
            </Card>
        );
    }

    const renderModelCard = (type: 'most' | 'least', modelInfo: { id: string; displayLabel: string; response: string; score: number } | null) => {
        if (!modelInfo) return null;
        const isMost = type === 'most';
        const IconToRender = isMost ? ArrowUpCircle : ArrowDownCircle;
        const title = isMost ? "Highest Semantic Similarity to Ideal" : "Lowest Semantic Similarity to Ideal";
        const iconColor = "text-muted-foreground dark:text-slate-400";
        
        const isClickable = !!onModelClick;
        const cardClasses = `flex-1 min-w-0 bg-card/60 dark:bg-slate-800/50 shadow-md ring-1 ring-border dark:ring-slate-700/70 ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-primary dark:hover:ring-sky-500 transition-all duration-150' : ''}`;

        return (
            <Card 
                className={cardClasses}
                onClick={() => {
                    if (isClickable) {
                        onModelClick(modelInfo.id);
                    }
                }}
            >
                <CardHeader className="p-2.5 border-b border-border dark:border-slate-700/80">
                    <div className="flex items-center justify-between">
                        <CardTitle className={`text-sm font-semibold flex items-center`}>
                            {IconToRender && <IconToRender className={`w-4 h-4 mr-1.5 ${iconColor}`} />}
                            {title}: {modelInfo.displayLabel}
                        </CardTitle>
                        <Badge variant="outline" className={`text-xs font-medium`}>
                            Similarity: {typeof modelInfo.score === 'number' && !isNaN(modelInfo.score) ? modelInfo.score.toFixed(3) : 'N/A'}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-2.5">
                    <div className="prose prose-xs dark:prose-invert max-w-none text-muted-foreground dark:text-slate-300 max-h-48 overflow-y-auto custom-scrollbar p-1 rounded bg-muted/30 dark:bg-slate-700/30 text-[11px]">
                        {modelInfo.response && ReactMarkdown && RemarkGfmPlugin ? (
                            <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{modelInfo.response}</ReactMarkdown>
                        ) : <p className="italic">Response not available.</p>}
                    </div>
                </CardContent>
            </Card>
        );
    };
    
    // Only render if there is at least one model to show.
    if (!mostSimilarModelInfo && !leastSimilarModelInfo) return null;

    return (
        <Card className="shadow-lg border-border dark:border-slate-700 mt-6">
            <CardHeader>
                <CardTitle className="text-primary">Semantic Similarity Extremes</CardTitle>
                 <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                    These cards highlight models with the highest and lowest semantic similarity scores compared to the ideal response. This measures stylistic and structural similarity, and is not a measure of response quality or correctness.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col md:flex-row gap-4">
                    {mostSimilarModelInfo && renderModelCard('most', mostSimilarModelInfo)}
                    {leastSimilarModelInfo && renderModelCard('least', leastSimilarModelInfo)}
                </div>
            </CardContent>
        </Card>
    );
};

export default SemanticExtremesDisplay; 