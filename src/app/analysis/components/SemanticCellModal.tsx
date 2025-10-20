'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { getModelDisplayLabel, parseModelIdForDisplay, resolveModelId } from '@/app/utils/modelIdUtils';
import Icon from '@/components/ui/icon';
import ResponseRenderer from '@/app/components/ResponseRenderer';

interface ClusterInfo {
    clusterId: number;
    clusterLetter: string;
    avgSimilarityToCluster: number;
    clusterMembers: string[];
    clusterColor: { bgColor: string; borderColor: string; textColor: string };
}

// Cluster hues matching MacroSemanticTable
const CLUSTER_HUES = [
    { hue: 210, name: 'Blue' },
    { hue: 140, name: 'Green' },
    { hue: 30, name: 'Orange' },
    { hue: 270, name: 'Purple' },
    { hue: 330, name: 'Pink' },
    { hue: 50, name: 'Yellow' },
    { hue: 180, name: 'Cyan' },
    { hue: 0, name: 'Red' },
];

function getClusterColorForModal(clusterId: number, similarityPct: number): {
    bgColor: string;
    borderColor: string;
    textColor: string;
} {
    const hue = CLUSTER_HUES[clusterId % CLUSTER_HUES.length].hue;
    const saturation = 60;
    const lightness = 85 - (similarityPct * 0.35);

    const bgColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    const borderColor = `hsl(${hue}, ${saturation + 10}%, ${lightness - 10}%)`;
    const textColor = `hsl(${hue}, 30%, 15%)`;

    return { bgColor, borderColor, textColor };
}

const SemanticCellModal: React.FC = () => {
    const {
        semanticCellModal,
        closeSemanticCellModal,
        fetchPromptResponses,
        fetchPerPromptSimilarities,
        promptTextsForMacroTable,
    } = useAnalysis();

    const isOpen = semanticCellModal?.isOpen || false;
    const promptId = semanticCellModal?.promptId || null;
    const modelId = semanticCellModal?.modelId || null;
    const clusterData = semanticCellModal?.clusterData || null;

    const [responses, setResponses] = useState<Record<string, string> | null>(null);
    const [similarities, setSimilarities] = useState<Record<string, Record<string, number>> | null>(null);
    const [loading, setLoading] = useState(false);
    const [showContrastingCluster, setShowContrastingCluster] = useState(false);

    // Load data when modal opens
    useEffect(() => {
        let cancelled = false;

        const loadData = async () => {
            if (!isOpen || !promptId || !fetchPromptResponses || !fetchPerPromptSimilarities) {
                setResponses(null);
                setSimilarities(null);
                return;
            }

            setLoading(true);
            try {
                const [responsesData, simData] = await Promise.all([
                    fetchPromptResponses(promptId),
                    fetchPerPromptSimilarities(promptId),
                ]);

                if (!cancelled) {
                    setResponses(responsesData || null);
                    // Handle both nested and flat similarity data structures
                    const similaritiesData = simData?.similarities ?? simData ?? null;
                    setSimilarities(similaritiesData as Record<string, Record<string, number>> | null);
                }
            } catch (error) {
                console.error('[SemanticCellModal] Failed to load data:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadData();
        return () => {
            cancelled = true;
        };
    }, [isOpen, promptId, fetchPromptResponses, fetchPerPromptSimilarities]);

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setResponses(null);
            setSimilarities(null);
            setShowContrastingCluster(false);
            setShowAllMembers(false);
        }
    }, [isOpen]);

    // Build cluster info
    const clusterInfo: ClusterInfo | null = useMemo(() => {
        if (!clusterData || !modelId) return null;

        const clusterId = clusterData.clusterId;
        const clusterLetter = String.fromCharCode(65 + clusterId);
        const avgSimilarityToCluster = clusterData.avgSimilarityToCluster * 100;
        const clusterMembers = clusterData.clusterMembers.filter((m: string) => m !== modelId);
        const clusterColor = getClusterColorForModal(clusterId, avgSimilarityToCluster);

        return {
            clusterId,
            clusterLetter,
            avgSimilarityToCluster,
            clusterMembers,
            clusterColor,
        };
    }, [clusterData, modelId]);

    // Get similarity scores to cluster members
    const memberSimilarities = useMemo(() => {
        if (!similarities || !modelId || !clusterInfo) return [];

        // Parse to get base model ID (without temp suffix)
        const baseModelId = parseModelIdForDisplay(modelId).baseId;

        return clusterInfo.clusterMembers
            .map(memberId => {
                // Parse member ID to get base form
                const baseMemberId = parseModelIdForDisplay(memberId).baseId;

                // Look up similarity using base IDs
                const sim = similarities[baseModelId]?.[baseMemberId] ?? similarities[baseMemberId]?.[baseModelId] ?? 0;

                return {
                    modelId: memberId, // Keep full ID for display
                    similarity: sim,
                };
            })
            .sort((a, b) => b.similarity - a.similarity);
    }, [similarities, modelId, clusterInfo]);

    const [showAllMembers, setShowAllMembers] = useState(false);

    // Find a contrasting cluster (one with different responses)
    const contrastingCluster = useMemo(() => {
        if (!clusterData?.allClusters || !modelId) return null;

        // Find a different cluster
        const otherClusters = clusterData.allClusters.filter(
            (c: any) => c.clusterId !== clusterInfo?.clusterId
        );

        if (otherClusters.length === 0) return null;

        // Pick the largest other cluster
        const largest = otherClusters.reduce((prev: any, curr: any) =>
            curr.members.length > prev.members.length ? curr : prev
        );

        return {
            clusterId: largest.clusterId,
            clusterLetter: String.fromCharCode(65 + largest.clusterId),
            members: largest.members,
            exampleModelId: largest.members[0],
        };
    }, [clusterData, clusterInfo, modelId]);

    // Resolve model IDs to find responses (handles base ID vs full ID mapping)
    // MUST be before early return to satisfy Rules of Hooks
    const currentResponse = useMemo(() => {
        if (!responses || !modelId) return null;
        const keys = Object.keys(responses);
        let resolvedId = resolveModelId(modelId, keys);
        if (!responses[resolvedId]) {
            // Fallback: try base ID match
            const baseId = parseModelIdForDisplay(modelId).baseId;
            const fallback = keys.find(k => parseModelIdForDisplay(k).baseId === baseId);
            if (fallback) resolvedId = fallback;
        }
        return responses[resolvedId] || null;
    }, [responses, modelId]);

    const contrastResponse = useMemo(() => {
        if (!showContrastingCluster || !responses || !contrastingCluster) return null;
        const keys = Object.keys(responses);
        const exampleId = contrastingCluster.exampleModelId;
        let resolvedId = resolveModelId(exampleId, keys);
        if (!responses[resolvedId]) {
            const baseId = parseModelIdForDisplay(exampleId).baseId;
            const fallback = keys.find(k => parseModelIdForDisplay(k).baseId === baseId);
            if (fallback) resolvedId = fallback;
        }
        return responses[resolvedId] || null;
    }, [showContrastingCluster, responses, contrastingCluster]);

    // Early return AFTER all hooks (Rules of Hooks)
    if (!isOpen) return null;

    const promptText = promptId ? (promptTextsForMacroTable?.[promptId] || promptId) : 'Unknown Prompt';
    const modelDisplayName = modelId ? getModelDisplayLabel(parseModelIdForDisplay(modelId), {
        hideProvider: true,
        prettifyModelName: true,
    }) : 'Unknown Model';

    return (
        <Dialog open={isOpen} onOpenChange={closeSemanticCellModal}>
            <DialogContent className="w-[95vw] h-[90vh] max-w-[1400px] flex flex-col p-0">
                <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
                    <DialogTitle className="text-xl flex items-center gap-3">
                        <Icon name="layers" className="w-5 h-5 text-primary" />
                        Semantic Cluster Analysis
                    </DialogTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                        <span className="font-medium">{modelDisplayName}</span>
                        <span className="mx-2">•</span>
                        <span className="max-w-[500px] inline-block truncate align-bottom">{promptText}</span>
                    </div>
                </DialogHeader>

                {loading ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-sm text-muted-foreground">Loading response data...</div>
                    </div>
                ) : !clusterInfo || !currentResponse ? (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-sm text-muted-foreground">No data available</div>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-4">
                        {/* Cluster Badge */}
                        <div className="mb-4 flex items-center gap-3">
                            <div
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border-2 font-semibold"
                                style={{
                                    backgroundColor: clusterInfo.clusterColor.bgColor,
                                    borderColor: clusterInfo.clusterColor.borderColor,
                                    color: clusterInfo.clusterColor.textColor,
                                }}
                            >
                                <Icon name="git-branch" className="w-4 h-4" />
                                Cluster {clusterInfo.clusterLetter}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                {clusterInfo.clusterMembers.length + 1} models • Avg similarity {clusterInfo.avgSimilarityToCluster.toFixed(1)}%
                            </div>
                        </div>

                        {/* Model Response */}
                        <div className="mb-6">
                            <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                <Icon name="message-square" className="w-4 h-4" />
                                {modelDisplayName}'s Response
                            </h3>
                            <div className="border rounded-lg p-4 bg-card">
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    <ResponseRenderer content={currentResponse} />
                                </div>
                            </div>
                        </div>

                        {/* Cluster Members */}
                        {memberSimilarities.length > 0 && (
                            <div className="mb-6">
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-semibold flex items-center gap-2">
                                        <Icon name="users" className="w-4 h-4" />
                                        Similar Models in Cluster {clusterInfo.clusterLetter}
                                    </h3>
                                    {memberSimilarities.length > 5 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowAllMembers(!showAllMembers)}
                                        >
                                            {showAllMembers ? 'Show Less' : `Show All ${memberSimilarities.length}`}
                                        </Button>
                                    )}
                                </div>
                                <div className="border rounded-lg divide-y">
                                    {(showAllMembers ? memberSimilarities : memberSimilarities.slice(0, 5)).map(({ modelId: memberId, similarity }) => (
                                        <div key={memberId} className="px-4 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors">
                                            <span className="text-sm font-medium">
                                                {getModelDisplayLabel(parseModelIdForDisplay(memberId), {
                                                    hideProvider: true,
                                                    prettifyModelName: true,
                                                })}
                                            </span>
                                            <Badge variant="secondary" className="text-xs">
                                                {(similarity * 100).toFixed(1)}% similar
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Contrasting Cluster */}
                        {contrastingCluster && (
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-sm font-semibold flex items-center gap-2">
                                        <Icon name="git-compare-arrows" className="w-4 h-4" />
                                        Contrasting Cluster {contrastingCluster.clusterLetter}
                                    </h3>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowContrastingCluster(!showContrastingCluster)}
                                    >
                                        {showContrastingCluster ? 'Hide' : 'Show'} Example Response
                                    </Button>
                                </div>
                                <div className="text-xs text-muted-foreground mb-2">
                                    {contrastingCluster.members.length} models responded differently
                                </div>
                                {showContrastingCluster && contrastResponse && (
                                    <div className="border rounded-lg p-4 bg-muted/20">
                                        <div className="text-xs font-medium text-muted-foreground mb-2">
                                            Example from {getModelDisplayLabel(parseModelIdForDisplay(contrastingCluster.exampleModelId), {
                                                hideProvider: true,
                                                prettifyModelName: true,
                                            })}
                                        </div>
                                        <div className="prose prose-sm dark:prose-invert max-w-none">
                                            <ResponseRenderer content={contrastResponse} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default SemanticCellModal;
