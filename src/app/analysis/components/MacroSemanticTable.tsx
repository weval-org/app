'use client';

import React, { useMemo, useState } from 'react';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { useAnalysis } from '../context/AnalysisContext';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const hclust = require('ml-hclust');

// Helper to format bytes
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Cluster hues (H in HSL) - distinct, accessible colors
const CLUSTER_HUES = [
    { hue: 210, name: 'Blue' },      // Blue
    { hue: 140, name: 'Green' },     // Green
    { hue: 30, name: 'Orange' },     // Orange
    { hue: 270, name: 'Purple' },    // Purple
    { hue: 330, name: 'Pink' },      // Pink
    { hue: 50, name: 'Yellow' },     // Yellow
    { hue: 180, name: 'Cyan' },      // Cyan
    { hue: 0, name: 'Red' },         // Red
];

/**
 * Generate dynamic HSL color based on cluster and similarity percentage.
 * Higher similarity = darker/more saturated color.
 * Normalizes to the actual data range (minSimilarity to maxSimilarity) for better visual differentiation.
 */
function getClusterColor(
    clusterId: number,
    similarityPct: number,
    minSimilarity: number,
    maxSimilarity: number,
    isDark: boolean
): {
    bgColor: string;
    borderColor: string;
    textColor: string;
} {
    const hue = CLUSTER_HUES[clusterId % CLUSTER_HUES.length].hue;
    const saturation = isDark ? 60 : 70; // Slightly less saturated in dark mode

    // Normalize similarity to 0-1 range based on actual data range
    const range = maxSimilarity - minSimilarity;
    const normalizedValue = range > 0 ? (similarityPct - minSimilarity) / range : 0.5;

    // Map normalized value (0-1) to lightness
    // Low similarity = lighter (80%), high similarity = darker (35%)
    const minLightness = isDark ? 50 : 35;
    const maxLightness = isDark ? 80 : 80;
    const lightness = maxLightness - (normalizedValue * (maxLightness - minLightness));

    const bgColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

    // Border: slightly darker/more saturated
    const borderLightness = isDark ? lightness - 10 : lightness - 15;
    const borderColor = `hsl(${hue}, ${saturation + 10}%, ${borderLightness}%)`;

    // Text: high contrast
    const textLightness = isDark ? 95 : 15;
    const textColor = `hsl(${hue}, 30%, ${textLightness}%)`;

    return { bgColor, borderColor, textColor };
}

interface ClusterAssignment {
    clusterId: number;
    avgSimilarityToCluster: number;
    clusterMembers: string[];
}

interface SemanticData {
    promptId: string;
    clusters: Map<string, ClusterAssignment>; // modelId -> cluster info
    minSimilarity: number; // Min similarity in this prompt (for color normalization)
    maxSimilarity: number; // Max similarity in this prompt (for color normalization)
    variance: number; // Coefficient of variation of cluster sizes (for row ordering)
}

const MacroSemanticTable: React.FC = () => {
    const {
        data,
        configId,
        runLabel,
        timestamp,
        modelsForMacroTable,
        promptTextsForMacroTable,
        openModelPerformanceModal,
        openPromptDetailModal,
        openSimilarityModal,
        openPromptSimilarityModal,
        openSemanticCellModal,
    } = useAnalysis();

    const [perPromptData, setPerPromptData] = useState(data?.evaluationResults?.perPromptSimilarities);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [downloadProgress, setDownloadProgress] = useState<{ loaded: number; total: number } | null>(null);

    // Filter out IDEAL model and sort by average similarity (most similar first)
    const models = useMemo(() => {
        const filtered = modelsForMacroTable.filter(m => m.toUpperCase() !== IDEAL_MODEL_ID.toUpperCase());

        // If we have similarity data, sort by average similarity to all other models
        if (!perPromptData || !data) return filtered;

        // Calculate average similarity per model across all prompts
        const modelAvgSimilarity = new Map<string, number>();

        filtered.forEach(modelId => {
            let totalSim = 0;
            let count = 0;

            data.promptIds.forEach(promptId => {
                const promptSims = perPromptData[promptId];
                if (!promptSims || !promptSims[modelId]) return;

                filtered.forEach(otherId => {
                    if (otherId === modelId) return;
                    const sim = promptSims[modelId][otherId];
                    if (typeof sim === 'number' && !isNaN(sim)) {
                        totalSim += sim;
                        count++;
                    }
                });
            });

            const avgSim = count > 0 ? totalSim / count : 0;
            modelAvgSimilarity.set(modelId, avgSim);
        });

        // Sort by average similarity descending (most similar to others first)
        return filtered.sort((a, b) => {
            const simA = modelAvgSimilarity.get(a) || 0;
            const simB = modelAvgSimilarity.get(b) || 0;
            return simB - simA;
        });
    }, [modelsForMacroTable, perPromptData, data]);

    // Parse models for display
    const parsedModels = useMemo(() => {
        return models.map(m => parseModelIdForDisplay(m));
    }, [models]);

    // Calculate clusters for each prompt
    const semanticData = useMemo<SemanticData[]>(() => {
        if (!perPromptData || !data) return [];

        return data.promptIds.map(promptId => {
            const promptSimilarities = perPromptData[promptId];
            if (!promptSimilarities) {
                return { promptId, clusters: new Map(), minSimilarity: 0, maxSimilarity: 0, variance: 0 };
            }

            // Build distance matrix
            const distanceMatrix: number[][] = [];
            models.forEach((m1, i) => {
                distanceMatrix[i] = [];
                models.forEach((m2, j) => {
                    if (i === j) {
                        distanceMatrix[i][j] = 0;
                    } else {
                        let simScore = promptSimilarities[m1]?.[m2];
                        if (typeof simScore !== 'number' || isNaN(simScore)) {
                            simScore = 0;
                        }
                        distanceMatrix[i][j] = 1 - simScore;
                    }
                });
            });

            // Perform hierarchical clustering
            let clusterTree;
            try {
                clusterTree = hclust.agnes(distanceMatrix, { method: 'ward' });
            } catch (error) {
                console.error(`[MacroSemanticTable] Clustering failed for prompt ${promptId}:`, error);
                return { promptId, clusters: new Map(), minSimilarity: 0, maxSimilarity: 0, variance: 0 };
            }

            // Cut tree to get clusters (aim for more variety, ~40-60% of model count)
            // 3 models → 2 clusters, 5 models → 3 clusters, 7 models → 4 clusters, 10+ → 5 clusters
            const targetClusters = Math.min(Math.max(Math.floor(models.length / 2), 2), 6);
            const assignments = cutTree(clusterTree, targetClusters, models.length);

            // Debug: Check cluster distribution
            const clusterCounts = new Map<number, number>();
            assignments.forEach(cid => {
                clusterCounts.set(cid, (clusterCounts.get(cid) || 0) + 1);
            });
            console.log(`[MacroSemanticTable] Prompt ${promptId}: ${models.length} models, target ${targetClusters} clusters, actual distribution:`, Object.fromEntries(clusterCounts));

            // Build cluster info
            const clusters = new Map<string, ClusterAssignment>();
            const clusterMembers = new Map<number, string[]>();

            models.forEach((modelId, idx) => {
                const clusterId = assignments[idx];
                if (!clusterMembers.has(clusterId)) {
                    clusterMembers.set(clusterId, []);
                }
                clusterMembers.get(clusterId)!.push(modelId);
            });

            // Calculate similarity values and track min/max for color normalization
            let minSim = Infinity;
            let maxSim = -Infinity;

            models.forEach((modelId, idx) => {
                const clusterId = assignments[idx];
                const members = clusterMembers.get(clusterId) || [];

                // Calculate average similarity to cluster members
                let avgSim = 0;
                let count = 0;
                members.forEach(otherId => {
                    if (otherId !== modelId) {
                        const sim = promptSimilarities[modelId]?.[otherId];
                        if (typeof sim === 'number' && !isNaN(sim)) {
                            avgSim += sim;
                            count++;
                        }
                    }
                });

                avgSim = count > 0 ? avgSim / count : 1.0;

                // Track min/max
                minSim = Math.min(minSim, avgSim);
                maxSim = Math.max(maxSim, avgSim);

                clusters.set(modelId, {
                    clusterId,
                    avgSimilarityToCluster: avgSim,
                    clusterMembers: members,
                });
            });

            // Convert to percentage
            const minSimilarity = (minSim === Infinity ? 0 : minSim) * 100;
            const maxSimilarity = (maxSim === -Infinity ? 100 : maxSim) * 100;

            // Calculate variance for row ordering (coefficient of variation)
            const clusterSizes = Array.from(clusterCounts.values());
            let variance = 0;
            if (clusterSizes.length > 0) {
                const mean = clusterSizes.reduce((a, b) => a + b, 0) / clusterSizes.length;
                const varianceSum = clusterSizes.reduce((sum, size) => sum + Math.pow(size - mean, 2), 0);
                const stdDev = Math.sqrt(varianceSum / clusterSizes.length);
                variance = mean > 0 ? stdDev / mean : 0; // Coefficient of variation
            }

            return { promptId, clusters, minSimilarity, maxSimilarity, variance };
        }).sort((a, b) => b.variance - a.variance); // Sort by variance descending (most interesting first)
    }, [perPromptData, data, models]);

    if (!data) {
        return null;
    }

    const loadPerPromptSimilarities = async () => {
        setIsLoading(true);
        setLoadError(null);
        setDownloadProgress(null);

        try {
            const response = await fetch(`/api/comparison/${configId}/${runLabel}/${timestamp}/raw`);
            if (!response.ok) {
                throw new Error(`Failed to load data: ${response.statusText}`);
            }

            // Get total size from Content-Length header
            const contentLength = response.headers.get('content-length');
            const total = contentLength ? parseInt(contentLength, 10) : 0;

            // Use ReadableStream to track progress
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Response body not readable');
            }

            let receivedLength = 0;
            const chunks: Uint8Array[] = [];

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                chunks.push(value);
                receivedLength += value.length;

                // Update progress
                if (total > 0) {
                    setDownloadProgress({ loaded: receivedLength, total });
                }
            }

            // Concatenate chunks and decode
            const allChunks = new Uint8Array(receivedLength);
            let position = 0;
            for (const chunk of chunks) {
                allChunks.set(chunk, position);
                position += chunk.length;
            }

            const text = new TextDecoder('utf-8').decode(allChunks);
            const fullData = JSON.parse(text);
            const similarities = fullData.evaluationResults?.perPromptSimilarities;

            if (!similarities || Object.keys(similarities).length === 0) {
                throw new Error('No per-prompt similarity data found in full dataset');
            }

            setPerPromptData(similarities);
        } catch (error: any) {
            console.error('[MacroSemanticTable] Failed to load per-prompt similarities:', error);
            setLoadError(error.message || 'Failed to load semantic data. Please try again.');
        } finally {
            setIsLoading(false);
            setDownloadProgress(null);
        }
    };

    // If perPromptSimilarities not available, show load button
    if (!perPromptData) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-4 border-2 border-dashed border-border rounded-lg">
                <Icon name="download" className="w-12 h-12 text-muted-foreground" />
                <div className="text-center space-y-2 max-w-xl px-4">
                    <p className="font-semibold text-lg">Semantic Clustering Available</p>
                    <p className="text-sm text-muted-foreground">
                        Load detailed per-prompt similarity data to see how models clustered for each scenario.
                        This shows which models responded similarly to each prompt.
                    </p>
                    <p className="text-xs text-muted-foreground">
                        Note: May take a moment to download (~500KB-2MB depending on run size).
                    </p>
                </div>
                <Button onClick={loadPerPromptSimilarities} disabled={isLoading} size="lg">
                    {isLoading ? (
                        <>
                            <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                            Loading...
                        </>
                    ) : (
                        <>
                            <Icon name="download" className="w-4 h-4 mr-2" />
                            Load Semantic Clustering
                        </>
                    )}
                </Button>

                {/* Progress Bar */}
                {isLoading && downloadProgress && (
                    <div className="w-full max-w-md space-y-2">
                        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-primary h-2.5 rounded-full transition-all duration-300"
                                style={{ width: `${(downloadProgress.loaded / downloadProgress.total) * 100}%` }}
                            />
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{formatBytes(downloadProgress.loaded)} / {formatBytes(downloadProgress.total)}</span>
                            <span>{Math.round((downloadProgress.loaded / downloadProgress.total) * 100)}%</span>
                        </div>
                    </div>
                )}

                {loadError && (
                    <Alert variant="destructive" className="max-w-xl">
                        <Icon name="alert-circle" className="h-4 w-4" />
                        <AlertTitle>Load Failed</AlertTitle>
                        <AlertDescription>{loadError}</AlertDescription>
                    </Alert>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Legend */}
            <div className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg border border-border">
                <Icon name="info" className="w-5 h-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm">
                    <p className="font-semibold">Semantic Clustering Visualization</p>
                    <p className="text-muted-foreground">
                        Each row shows how models clustered based on response similarity for that prompt.
                        <strong> Same letter = similar responses. Darker color = higher similarity.</strong>
                    </p>
                    <div className="flex flex-wrap gap-3 mt-2">
                        {CLUSTER_HUES.slice(0, 5).map((cluster, idx) => (
                            <div key={idx} className="flex items-center gap-1.5">
                                <div className="flex gap-0.5">
                                    {[40, 70, 100].map(pct => {
                                        // Example gradient: normalize 40-100% to color range
                                        const colors = getClusterColor(idx, pct, 40, 100, false);
                                        return (
                                            <div
                                                key={pct}
                                                className="w-3 h-4 rounded-sm border"
                                                style={{
                                                    backgroundColor: colors.bgColor,
                                                    borderColor: colors.borderColor,
                                                }}
                                                title={`${pct}% similarity`}
                                            />
                                        );
                                    })}
                                </div>
                                <span className="text-xs text-muted-foreground">Cluster {String.fromCharCode(65 + idx)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="w-full">
                <table className="w-full border-collapse table-fixed">
                    <colgroup>
                        <col style={{ width: '300px' }} />
                        {models.map((_, idx) => (
                            <col key={idx} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr className="border-b-2 border-border">
                            <th className="px-4 py-3 text-left font-semibold text-sm sticky left-0 bg-background z-20 shadow-[2px_0_4px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_4px_rgba(0,0,0,0.3)]">
                                Prompt
                            </th>
                            {parsedModels.map((parsed, idx) => (
                                <th
                                    key={models[idx]}
                                    className="px-1 py-3 text-center font-semibold cursor-pointer hover:bg-muted/50 transition-colors"
                                    onClick={() => openSimilarityModal(models[idx])}
                                    title={`Click for similarity analysis of ${getModelDisplayLabel(parsed)}`}
                                >
                                    <div className="text-[10px] leading-tight break-words">
                                        {getModelDisplayLabel(parsed, {
                                            hideProvider: true,
                                            hideModelMaker: true,
                                            prettifyModelName: true,
                                            hideSystemPrompt: true,
                                            hideTemperature: true,
                                        })}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {semanticData.map(({ promptId, clusters, minSimilarity, maxSimilarity }) => {
                            const promptText = promptTextsForMacroTable[promptId] || promptId;

                            // Build allClusters data for modal
                            const clusterMap = new Map<number, string[]>();
                            clusters.forEach((info, modelId) => {
                                const cid = info.clusterId;
                                if (!clusterMap.has(cid)) {
                                    clusterMap.set(cid, []);
                                }
                                clusterMap.get(cid)!.push(modelId);
                            });
                            const allClustersForPrompt = Array.from(clusterMap.entries()).map(([clusterId, members]) => ({
                                clusterId,
                                members,
                            }));

                            return (
                                <tr key={promptId} className="border-b border-border hover:bg-muted/20 transition-colors">
                                    <td
                                        className="px-4 py-2 sticky left-0 bg-background z-20 shadow-[2px_0_4px_rgba(0,0,0,0.1)] dark:shadow-[2px_0_4px_rgba(0,0,0,0.3)] cursor-pointer hover:text-primary transition-colors"
                                        onClick={() => openPromptSimilarityModal?.(promptId)}
                                        title="Click to view per-prompt similarity analysis"
                                    >
                                        <div className="max-w-[300px] truncate text-sm">
                                            {promptText}
                                        </div>
                                    </td>
                                    {models.map(modelId => {
                                        const clusterInfo = clusters.get(modelId);
                                        if (!clusterInfo) {
                                            return (
                                                <td key={modelId} className="px-1 py-2 text-center">
                                                    <div className="text-[10px] text-muted-foreground">N/A</div>
                                                </td>
                                            );
                                        }

                                        const similarityPct = clusterInfo.avgSimilarityToCluster * 100;
                                        const colors = getClusterColor(clusterInfo.clusterId, similarityPct, minSimilarity, maxSimilarity, false); // TODO: detect dark mode
                                        const memberCount = clusterInfo.clusterMembers.length;

                                        // Prepare cluster data for modal
                                        const clusterDataForModal = {
                                            ...clusterInfo,
                                            allClusters: allClustersForPrompt,
                                        };

                                        return (
                                            <td key={modelId} className="px-1 py-2">
                                                <div
                                                    className="flex items-center justify-center gap-0.5 rounded border-2 px-1.5 py-0.5 cursor-pointer hover:scale-105 transition-transform text-[10px]"
                                                    style={{
                                                        backgroundColor: colors.bgColor,
                                                        borderColor: colors.borderColor,
                                                    }}
                                                    onClick={() => openSemanticCellModal?.(promptId, modelId, clusterDataForModal)}
                                                    title={`Click to view response details\nCluster ${String.fromCharCode(65 + clusterInfo.clusterId)} (${memberCount} models)\nAvg similarity: ${similarityPct.toFixed(1)}%\nMembers: ${clusterInfo.clusterMembers.map(m => getModelDisplayLabel(parseModelIdForDisplay(m), { hideProvider: true, prettifyModelName: true, hideSystemPrompt: true, hideTemperature: true })).join(', ')}`}
                                                >
                                                    <span
                                                        className="font-bold"
                                                        style={{ color: colors.textColor }}
                                                    >
                                                        {String.fromCharCode(65 + clusterInfo.clusterId)}
                                                    </span>
                                                    <span
                                                        style={{ color: colors.textColor, opacity: 0.8 }}
                                                    >
                                                        {similarityPct.toFixed(0)}%
                                                    </span>
                                                </div>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// Helper function to cut dendrogram tree into k clusters
function cutTree(tree: any, k: number, n: number): number[] {
    const assignments = new Array(n).fill(-1);

    if (!tree || k <= 0) {
        return assignments.map((_, i) => 0);
    }

    if (k >= n) {
        // Each item in its own cluster
        return assignments.map((_, i) => i);
    }

    // Collect all merge heights in order
    const merges: number[] = [];

    function collectMerges(node: any) {
        if (!node || node.isLeaf) return;
        merges.push(node.height);
        if (node.children) {
            node.children.forEach((child: any) => collectMerges(child));
        }
    }

    collectMerges(tree);

    // Sort by height ascending (smallest to largest)
    merges.sort((a, b) => a - b);

    // To get k clusters, we need to prevent the last (k-1) merges
    // So we cut at the (n-k)th merge height
    const cutIndex = n - k;
    const cutHeight = cutIndex >= 0 && cutIndex < merges.length ? merges[cutIndex] : 0;

    console.log(`[cutTree] ${n} items, target ${k} clusters, cut at height ${cutHeight.toFixed(4)}, cut index: ${cutIndex}, total merges: ${merges.length}`);

    // Traverse tree and assign cluster IDs
    // Any subtree with root height <= cutHeight becomes one cluster
    let nextClusterId = 0;

    function assignClusters(node: any): number {
        if (!node) return -1;

        if (node.isLeaf) {
            // Assign new cluster ID to this leaf
            const cid = nextClusterId++;
            assignments[node.index] = cid;
            return cid;
        }

        // If this merge is above the cut, treat children as separate clusters
        if (node.height > cutHeight) {
            if (node.children) {
                node.children.forEach((child: any) => assignClusters(child));
            }
            return -1;
        } else {
            // This merge is at or below cut height - all leaves under this node are one cluster
            const cid = nextClusterId++;
            markSubtreeWithCluster(node, cid);
            return cid;
        }
    }

    function markSubtreeWithCluster(node: any, clusterId: number): void {
        if (!node) return;

        if (node.isLeaf) {
            assignments[node.index] = clusterId;
        } else {
            if (node.children) {
                node.children.forEach((child: any) => markSubtreeWithCluster(child, clusterId));
            }
        }
    }

    assignClusters(tree);

    // Ensure all items are assigned
    for (let i = 0; i < assignments.length; i++) {
        if (assignments[i] === -1) {
            assignments[i] = 0;
        }
    }

    return assignments;
}

export default MacroSemanticTable;
