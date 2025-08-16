'use client';

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { PointAssessment, IndividualJudgement } from '@/app/utils/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Icon from '@/components/ui/icon';
import { usePreloadIcons } from '@/components/ui/use-preload-icons';
import ReactMarkdown from 'react-markdown';
import { ConversationMessage } from '@/types/shared';
import RemarkGfmPlugin from 'remark-gfm';

const getScoreColor = (score?: number): string => {
    if (score === undefined || score === null || isNaN(score)) return 'bg-slate-500';
    if (score >= 0.7) return 'bg-green-600';
    if (score >= 0.4) return 'bg-yellow-500';
    return 'bg-red-600';
};

const parseJudgeId = (judgeId: string): { approach: string, model: string } => {
    const match = judgeId.match(/^([\w-]+)\((.*)\)$/);
    if (match && match[1] && match[2]) {
        return { approach: match[1], model: getModelDisplayLabel(match[2]) };
    }
    return { approach: 'Custom', model: getModelDisplayLabel(judgeId) };
};

export const AssessmentItem: React.FC<{
    assessment: PointAssessment;
    index: number;
    isLogExpanded: boolean;
    toggleLogExpansion: (index: number) => void;
    isExpanded: boolean;
    toggleExpansion: () => void;
}> = ({ assessment, index, isLogExpanded, toggleLogExpansion, isExpanded, toggleExpansion }) => {
    const scoreColor = getScoreColor(assessment.coverageExtent);
    
    return (
        <Collapsible open={isExpanded} onOpenChange={toggleExpansion}>
            <div className={cn(
                "p-0 rounded-lg border-l-4 shadow-sm overflow-hidden",
                assessment.isInverted ? 
                    (assessment.coverageExtent !== undefined && assessment.coverageExtent >= 0.7 ? "border-green-600 bg-green-50/50 dark:bg-green-900/10" : "border-red-600 bg-red-50/50 dark:bg-red-900/10") :
                    (
                        assessment.coverageExtent !== undefined ?
                            assessment.coverageExtent >= 0.7 ? "border-green-600 bg-green-50/50 dark:bg-green-900/10" :
                            assessment.coverageExtent >= 0.4 ? "border-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10" :
                            "border-orange-500 bg-orange-50/50 dark:bg-orange-900/10"
                        : "border-slate-300 bg-card/50 dark:border-slate-700 dark:bg-slate-800/20"
                    )
            )}>
                <CollapsibleTrigger asChild>
                    <button type="button" className="flex justify-between items-center cursor-pointer p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors w-full text-left">
                        <h4 className="font-semibold text-sm text-primary pr-2 flex-1">{assessment.keyPointText}</h4>
                        <div className="flex items-center space-x-3 flex-shrink-0">
                            {assessment.isInverted && (
                                <Badge variant="destructive" className="text-xs font-normal whitespace-nowrap" title="This is a 'should not' criterion.">
                                    NEGATIVE
                                </Badge>
                            )}
                            {typeof assessment.coverageExtent === 'number' && !isNaN(assessment.coverageExtent) ? (
                                <Badge className={`text-xs text-white ${scoreColor}`}>
                                    {assessment.coverageExtent.toFixed(2)}{
                                        (assessment as any).stdDev !== undefined && !isNaN((assessment as any).stdDev) ? (
                                            <span className="ml-0.5 opacity-70">±{(assessment as any).stdDev.toFixed(2)}</span>
                                        ) : null
                                    }
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-xs text-muted-foreground">N/A</Badge>
                            )}
                            <div className="w-4">
                                {isExpanded ? <Icon name="chevron-up" className="h-4 w-4" /> : <Icon name="chevron-down" className="h-4 w-4" />}
                            </div>
                        </div>
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3">
                    <div className="pt-3 border-t border-border/50">
                        {assessment.citation && (
                            <div className="flex items-start space-x-1.5 mb-3 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-2">
                                <Icon name="quote" className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                <span>Source: {assessment.citation}</span>
                            </div>
                        )}
                        
                        {assessment.error && (
                            <Badge variant="destructive" className="text-xs flex items-center space-x-1.5 py-1 px-2 w-full justify-start mb-3">
                                <Icon name="alert-triangle" className="h-3 w-3" />
                                <span>Error: {assessment.error}</span>
                            </Badge>
                        )}

                        {assessment.reflection ? (
                        <div className="mt-1 p-3 rounded-md bg-background/70 dark:bg-slate-900/50 border border-dashed border-primary/30">
                            <div className="flex items-center space-x-1.5 mb-1.5">
                                <Icon name="message-square" className="h-4 w-4 text-primary/80 flex-shrink-0" />
                                <span className="font-semibold text-xs text-muted-foreground">Judge's Reflection:</span>
                            </div>
                            <p className="text-sm text-foreground/80 pl-1 whitespace-pre-wrap italic">"{assessment.reflection}"</p>
                        </div>
                        ) : (
                            <div className="mt-1 p-3 rounded-md bg-muted/50 text-center text-muted-foreground text-sm italic">No reflection provided.</div>
                        )}

                        {assessment.individualJudgements && assessment.individualJudgements.length > 0 && (
                            <Collapsible className="mt-3">
                                <CollapsibleTrigger asChild>
                                    <Button type="button" variant="ghost" className="text-xs h-7 px-2 w-full justify-start text-muted-foreground hover:text-foreground">
                                        <Icon name="chevrons-up-down" className="h-3.5 w-3.5 mr-1" />
                                        Show Consensus Breakdown ({assessment.individualJudgements.length} judges)
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-2 pl-4 border-l-2 border-border/50">
                                    <div className="space-y-3">
                                        {assessment.individualJudgements.map((judgement, j_index) => {
                                            const { approach, model } = parseJudgeId(judgement.judgeModelId);
                                            return (
                                            <div key={j_index} className="text-xs">
                                                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger>
                                                                <Badge variant="outline" className="font-normal capitalize cursor-default">{approach}</Badge>
                                                            </TooltipTrigger>
                                                            <TooltipContent><p>Judging Approach</p></TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                    <Badge variant="secondary" className="font-normal">{model}</Badge>
                                                    <Badge className={`text-white ${getScoreColor(judgement.coverageExtent)}`}>{judgement.coverageExtent.toFixed(2)}</Badge>
                                                </div>
                                                <p className="text-muted-foreground/80 italic pl-1 mt-1.5 whitespace-pre-wrap">"{judgement.reflection}"</p>
                                            </div>
                                        )})}
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        )}
                        
                        {(assessment.judgeModelId || assessment.judgeLog) && (
                            <div className="flex items-start space-x-1.5 pt-2 border-t border-border/50 mt-3">
                                <Icon name="server" className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                                <div className="flex-grow">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <span className="font-medium text-xs text-muted-foreground mr-1">Judge:</span>
                                            {assessment.judgeModelId ? (
                                                <Badge variant="outline" className="text-xs font-normal cursor-default">
                                                    {getModelDisplayLabel(assessment.judgeModelId)}
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-xs text-muted-foreground">N/A</Badge>
                                            )}
                                        </div>
                                        {assessment.judgeLog && assessment.judgeLog.length > 0 && (
                                            <Button type="button" variant="ghost" onClick={() => toggleLogExpansion(index)} className="text-xs h-6 px-2">
                                                {isLogExpanded ? <Icon name="chevron-up" className="h-3.5 w-3.5 mr-1" /> : <Icon name="chevron-down" className="h-3.5 w-3.5 mr-1" />}
                                                Log
                                            </Button>
                                        )}
                                    </div>
                                    {isLogExpanded && assessment.judgeLog && (
                                        <div className="mt-2 p-2 rounded bg-muted/50 dark:bg-slate-900/50">
                                            <pre className="font-mono text-[10px] max-h-48 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                                                {assessment.judgeLog.join('\n')}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
};

export const EvaluationView: React.FC<{
    assessments: PointAssessment[];
    modelResponse: string;
    idealResponse?: string;
    expandedLogs: Record<number, boolean>;
    toggleLogExpansion: (index: number) => void;
    isMobile?: boolean;
    // Optional: aggregated transcript of generated turns
    generatedTranscript?: string;
    // Optional: structured generated history for nicer rendering
    generatedHistory?: ConversationMessage[];
}> = ({ assessments, modelResponse, idealResponse, expandedLogs, toggleLogExpansion, isMobile = false, generatedTranscript, generatedHistory }) => {
    const [expandedAssessments, setExpandedAssessments] = useState<Set<number>>(new Set());
    const [activeTab, setActiveTab] = useState('model-response');

    usePreloadIcons(['message-square', 'chevron-up', 'chevron-down', 'chevrons-up-down', 'server', 'thumbs-down', 'alert-triangle', 'check-circle', 'trophy']);

    const toggleAssessmentExpansion = (index: number) => {
        setExpandedAssessments(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    };
    
    const { requiredPoints, alternativePaths, bestPathId } = useMemo(() => {
        const required: PointAssessment[] = [];
        const paths: Record<string, PointAssessment[]> = {};

        assessments.forEach(a => {
            if (a.pathId) {
                if (!paths[a.pathId]) {
                    paths[a.pathId] = [];
                }
                paths[a.pathId].push(a);
            } else {
                required.push(a);
            }
        });

        let bestPath: { id: string | null; score: number } = { id: null, score: -1 };
        
        Object.entries(paths).forEach(([pathId, pathAssessments]) => {
            const validAssessments = pathAssessments.filter(a => a.coverageExtent !== undefined);
            if (validAssessments.length > 0) {
                const totalScore = validAssessments.reduce((sum, a) => sum + a.coverageExtent!, 0);
                const avgScore = totalScore / validAssessments.length;
                if (avgScore > bestPath.score) {
                    bestPath = { id: pathId, score: avgScore };
                }
            }
        });

        const categorize = (list: PointAssessment[]) => {
            const criticalFailures: PointAssessment[] = [];
            const majorGaps: PointAssessment[] = [];
            const passed: PointAssessment[] = [];
            list.forEach(a => {
                if (a.isInverted && a.coverageExtent !== undefined && a.coverageExtent < 0.7) {
                    criticalFailures.push(a);
                } else if (!a.isInverted && a.coverageExtent !== undefined && a.coverageExtent < 0.4) {
                    majorGaps.push(a);
                } else {
                    passed.push(a);
                }
            });
            criticalFailures.sort((a,b) => (a.coverageExtent ?? 1) - (b.coverageExtent ?? 1));
            majorGaps.sort((a,b) => (a.coverageExtent ?? 1) - (b.coverageExtent ?? 1));
            passed.sort((a,b) => (b.coverageExtent ?? 0) - (a.coverageExtent ?? 0));
            return { criticalFailures, majorGaps, passed };
        };

        return {
            requiredPoints: categorize(required),
            alternativePaths: Object.entries(paths).map(([pathId, pathAssessments]) => ({
                pathId,
                ...categorize(pathAssessments),
            })).sort((a,b) => parseInt(a.pathId.split('_')[1]) - parseInt(b.pathId.split('_')[1])),
            bestPathId: bestPath.id,
        };
    }, [assessments]);

    const renderAssessmentList = (list: PointAssessment[]) => (
        list.map(assessment => {
            const originalIndex = assessments.indexOf(assessment);
            return (
                <AssessmentItem 
                    key={`${assessment.keyPointText}-${originalIndex}`}
                    assessment={assessment}
                    index={originalIndex}
                    isLogExpanded={expandedLogs[originalIndex] || false}
                    toggleLogExpansion={toggleLogExpansion}
                    isExpanded={expandedAssessments.has(originalIndex)}
                    toggleExpansion={() => toggleAssessmentExpansion(originalIndex)}
                />
            )
        })
    );

    const renderCategorizedAssessments = (categorized: { criticalFailures: PointAssessment[], majorGaps: PointAssessment[], passed: PointAssessment[] }) => (
        <>
            {categorized.criticalFailures.length > 0 && (
                <div>
                    <h4 className="font-bold text-base text-red-600 dark:text-red-500 flex items-center mb-4" title="A critical failure occurs when the model does something it was explicitly told not to do.">
                        <Icon name="thumbs-down" className="h-5 w-5 mr-2" /> Critical Failures ({categorized.criticalFailures.length})
                    </h4>
                    <div className="space-y-3 my-4">{renderAssessmentList(categorized.criticalFailures)}</div>
                </div>
            )}
            {categorized.majorGaps.length > 0 && (
                 <div>
                    <h4 className="font-bold text-base text-orange-600 dark:text-orange-500 flex items-center mb-4" title="A major gap occurs when the model fails to include a key positive requirement.">
                        <Icon name="alert-triangle" className="h-5 w-5 mr-2" /> Major Gaps ({categorized.majorGaps.length})
                    </h4>
                    <div className="space-y-3 my-4">{renderAssessmentList(categorized.majorGaps)}</div>
                </div>
            )}
            {categorized.passed.length > 0 && (
                <div>
                    <h4 className="font-bold text-base text-green-600 dark:text-green-500 flex items-center">
                        <Icon name="check-circle" className="h-5 w-5 mr-2" /> Passed Criteria ({categorized.passed.length})
                    </h4>
                    <div className="space-y-3 my-4">{renderAssessmentList(categorized.passed)}</div>
                </div>
            )}
        </>
    );

    if (isMobile) {
        // Mobile: Single column stacked view - user scrolls the entire page
        return (
            <div className="space-y-4">
                {/* Model Response Section */}
                <div className="bg-muted/20 border border-border/50 rounded-lg p-3">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="grid w-full grid-cols-2 h-9">
                            <TabsTrigger value="model-response">Model Output</TabsTrigger>
                            <TabsTrigger value="ideal-response" disabled={!idealResponse}>Ideal</TabsTrigger>
                        </TabsList>
                        <TabsContent value="model-response" className="pt-3">
                            {generatedHistory && generatedHistory.length ? (
                                <div className="space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                                    {generatedHistory.map((msg, idx) => (
                                        <div key={idx} className={cn(
                                            'rounded-md p-3 border',
                                            msg.role === 'user' ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800/40' :
                                            msg.role === 'assistant' ? 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700/40' :
                                            'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-700/40'
                                        )}>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{msg.role}</p>
                                            {msg.content === null ? (
                                                <p className="italic text-muted-foreground">[assistant: null — to be generated]</p>
                                            ) : (
                                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                                    <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{msg.content}</ReactMarkdown>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : modelResponse ? (
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{modelResponse}</ReactMarkdown>
                                </div>
                            ) : generatedTranscript ? (
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{generatedTranscript}</ReactMarkdown>
                                </div>
                            ) : (
                                <p className="italic text-muted-foreground">No intermediary turns available.</p>
                            )}
                        </TabsContent>
                        <TabsContent value="ideal-response" className="pt-3">
                            {idealResponse ? (
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{idealResponse}</ReactMarkdown>
                                </div>
                            ) : (
                                <p className="italic text-muted-foreground">No ideal response available.</p>
                            )}
                        </TabsContent>
                    </Tabs>
                </div>
                
                {/* Criteria Evaluation Section */}
                <div className="bg-muted/20 border border-border/50 rounded-lg p-3">
                    <h3 className="font-semibold text-muted-foreground text-sm mb-2 border-b border-border/30 pb-1">
                        Criteria Evaluation ({assessments.length})
                    </h3>
                    <div className="space-y-4">
                        {renderCategorizedAssessments({ 
                            criticalFailures: [
                                ...requiredPoints.criticalFailures, 
                                ...alternativePaths.flatMap(p => p.criticalFailures)
                            ],
                            majorGaps: [
                                ...requiredPoints.majorGaps,
                                ...alternativePaths.flatMap(p => p.majorGaps)
                            ],
                            passed: [
                                ...requiredPoints.passed,
                                ...alternativePaths.flatMap(p => p.passed)
                            ]
                        })}
                        {assessments.length === 0 && (
                            <p className="text-muted-foreground italic text-sm">No criteria assessments available.</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Desktop: Side-by-side layout with response and criteria
    return (
        <div className="flex flex-1 flex-col gap-4 text-sm lg:flex-row lg:gap-x-4 min-h-0">
            {/* Left Panel: Model Response */}
            <div className="flex flex-1 flex-col rounded-lg border border-border/50 bg-muted/20 p-3 lg:w-2/5 min-h-0">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
                    <TabsList className="grid w-full grid-cols-2 h-9 mb-1.5 flex-shrink-0">
                        <TabsTrigger value="model-response">Model Output</TabsTrigger>
                        <TabsTrigger value="ideal-response" disabled={!idealResponse}>Ideal</TabsTrigger>
                    </TabsList>
                    <TabsContent value="model-response" className="flex-grow overflow-y-auto custom-scrollbar pr-2">
                        {generatedHistory && generatedHistory.length ? (
                            <div className="space-y-3">
                                {generatedHistory.map((msg, idx) => (
                                    <div key={idx} className={cn(
                                        'rounded-md p-3 border',
                                        msg.role === 'user' ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800/40' :
                                        msg.role === 'assistant' ? 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700/40' :
                                        'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-700/40'
                                    )}>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{msg.role}</p>
                                        {msg.content === null ? (
                                            <p className="italic text-muted-foreground">[assistant: null — to be generated]</p>
                                        ) : (
                                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                                <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{msg.content}</ReactMarkdown>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : modelResponse ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{modelResponse}</ReactMarkdown>
                            </div>
                        ) : generatedTranscript ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{generatedTranscript}</ReactMarkdown>
                            </div>
                        ) : (
                            <p className="italic text-muted-foreground">No intermediary turns available.</p>
                        )}
                    </TabsContent>
                    <TabsContent value="ideal-response" className="flex-grow overflow-y-auto custom-scrollbar pr-2">
                        {idealResponse ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{idealResponse}</ReactMarkdown>
                            </div>
                        ) : (
                            <p className="italic text-muted-foreground">No ideal response available.</p>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Right Panel: Criteria Evaluation */}
            <div className="flex flex-1 flex-col rounded-lg border border-border/50 bg-muted/20 p-3 lg:w-3/5 min-h-0">
                <div className="custom-scrollbar min-h-0 flex-grow space-y-3 overflow-y-auto pr-2 pt-2">
                    {(requiredPoints.criticalFailures.length > 0 || requiredPoints.majorGaps.length > 0 || requiredPoints.passed.length > 0) && (
                        <div className="mb-4">
                            {/* <h4 className="font-bold text-base text-primary flex items-center mb-2">
                                Required Criteria
                            </h4> */}
                            {renderCategorizedAssessments(requiredPoints)}
                        </div>
                    )}
                    
                    {alternativePaths.length > 0 && (
                        <div>
                            {/* <h4 className="font-bold text-base text-primary flex items-center mb-2">
                                Alternative Paths (OR Logic)
                            </h4> */}
                            <div className="space-y-4">
                                {alternativePaths.map((path, index) => (
                                    <div key={path.pathId} className={cn(
                                        "rounded-lg border p-3",
                                        path.pathId === bestPathId ? "border-green-500 bg-green-50/30 dark:bg-green-900/10" : "border-border/50"
                                    )}>
                                        <div className="flex justify-between items-center mb-2">
                                            <h5 className="font-semibold text-muted-foreground">Path #{index + 1}</h5>
                                            {path.pathId === bestPathId && (
                                                <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                                                    <Icon name="trophy" className="h-3.5 w-3.5 mr-1" />
                                                    Best Path
                                                </Badge>
                                            )}
                                        </div>
                                        {renderCategorizedAssessments(path)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {assessments.length === 0 && (
                        <p className="text-muted-foreground italic text-sm">No criteria assessments available.</p>
                    )}
                </div>
            </div>
        </div>
    );
}; 