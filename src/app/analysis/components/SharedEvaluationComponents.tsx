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

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });
const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle), { ssr: false });
const MessageSquare = dynamic(() => import('lucide-react').then(mod => mod.MessageSquare), { ssr: false });
const ChevronDown = dynamic(() => import('lucide-react').then(mod => mod.ChevronDown), { ssr: false });
const ChevronUp = dynamic(() => import('lucide-react').then(mod => mod.ChevronUp), { ssr: false });
const ChevronsUpDown = dynamic(() => import('lucide-react').then(mod => mod.ChevronsUpDown), { ssr: false });
const Quote = dynamic(() => import('lucide-react').then(mod => mod.Quote), { ssr: false });
const Server = dynamic(() => import('lucide-react').then(mod => mod.Server), { ssr: false });
const CheckCircle = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle), { ssr: false });
const ThumbsDown = dynamic(() => import('lucide-react').then(mod => mod.ThumbsDown), { ssr: false });

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
                                    {assessment.coverageExtent.toFixed(2)}
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-xs text-muted-foreground">N/A</Badge>
                            )}
                            <div className="w-4">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </div>
                        </div>
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="px-3 pb-3">
                    <div className="pt-3 border-t border-border/50">
                        {assessment.citation && (
                            <div className="flex items-start space-x-1.5 mb-3 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-2">
                                <Quote className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                                <span>Source: {assessment.citation}</span>
                            </div>
                        )}
                        
                        {assessment.error && (
                            <Badge variant="destructive" className="text-xs flex items-center space-x-1.5 py-1 px-2 w-full justify-start mb-3">
                                <AlertTriangle className="h-3 w-3" />
                                <span>Error: {assessment.error}</span>
                            </Badge>
                        )}

                        {assessment.reflection ? (
                        <div className="mt-1 p-3 rounded-md bg-background/70 dark:bg-slate-900/50 border border-dashed border-primary/30">
                            <div className="flex items-center space-x-1.5 mb-1.5">
                                <MessageSquare className="h-4 w-4 text-primary/80 flex-shrink-0" />
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
                                        <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
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
                                <Server className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
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
                                                {isLogExpanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
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
    expandedLogs: Record<number, boolean>;
    toggleLogExpansion: (index: number) => void;
    isMobile?: boolean;
}> = ({ assessments, modelResponse, expandedLogs, toggleLogExpansion, isMobile = false }) => {
    const [expandedAssessments, setExpandedAssessments] = useState<Set<number>>(new Set());

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
    
    const { criticalFailures, majorGaps, passed } = useMemo(() => {
        const criticalFailures: PointAssessment[] = [];
        const majorGaps: PointAssessment[] = [];
        const passed: PointAssessment[] = [];

        assessments.forEach(a => {
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

    if (isMobile) {
        // Mobile: Single column stacked view - user scrolls the entire page
        return (
            <div className="space-y-4">
                {/* Model Response Section */}
                <div className="bg-muted/20 border border-border/50 rounded-lg p-3">
                    <h3 className="font-semibold text-muted-foreground text-sm mb-2 border-b border-border/30 pb-1">
                        Model Response
                    </h3>
                    <div>
                        {modelResponse ? (
                            <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]} className="prose prose-sm dark:prose-invert max-w-none">{modelResponse}</ReactMarkdown>
                        ) : (
                            <p className="italic text-muted-foreground">No response text available.</p>
                        )}
                    </div>
                </div>
                
                {/* Criteria Evaluation Section */}
                <div className="bg-muted/20 border border-border/50 rounded-lg p-3">
                    <h3 className="font-semibold text-muted-foreground text-sm mb-2 border-b border-border/30 pb-1">
                        Criteria Evaluation ({assessments.length})
                    </h3>
                    <div className="space-y-4">
                        {criticalFailures.length > 0 && (
                            <div>
                                <h4 className="font-bold text-base text-red-600 dark:text-red-500 flex items-center mb-2" title="A critical failure occurs when the model does something it was explicitly told not to do.">
                                    <ThumbsDown className="h-5 w-5 mr-2" /> Critical Failures ({criticalFailures.length})
                                </h4>
                                <div className="space-y-3">{renderAssessmentList(criticalFailures)}</div>
                            </div>
                        )}
                        {majorGaps.length > 0 && (
                             <div>
                                <h4 className="font-bold text-base text-orange-600 dark:text-orange-500 flex items-center mb-2" title="A major gap occurs when the model fails to include a key positive requirement.">
                                    <AlertTriangle className="h-5 w-5 mr-2" /> Major Gaps ({majorGaps.length})
                                </h4>
                                <div className="space-y-3">{renderAssessmentList(majorGaps)}</div>
                            </div>
                        )}
                        {passed.length > 0 && (
                            <div>
                                <h4 className="font-bold text-base text-green-600 dark:text-green-500 flex items-center mb-2">
                                    <CheckCircle className="h-5 w-5 mr-2" /> Passed Criteria ({passed.length})
                                </h4>
                                <div className="space-y-3">{renderAssessmentList(passed)}</div>
                            </div>
                        )}
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
                <p className="flex-shrink-0 mb-1.5 border-b border-border/30 pb-1 font-semibold text-muted-foreground">
                    Model Response
                </p>
                <div className="custom-scrollbar min-h-0 flex-grow overflow-y-auto pr-2">
                    {modelResponse ? (
                        <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]} className="prose prose-sm dark:prose-invert max-w-none">{modelResponse}</ReactMarkdown>
                    ) : (
                        <p className="italic text-muted-foreground">No response text available.</p>
                    )}
                </div>
            </div>

            {/* Right Panel: Criteria Evaluation */}
            <div className="flex flex-1 flex-col rounded-lg border border-border/50 bg-muted/20 p-3 lg:w-3/5 min-h-0">
                <h3 className="flex-shrink-0 mb-1.5 border-b border-border/30 pb-1 font-semibold text-muted-foreground">
                    Criteria Evaluation ({assessments.length})
                </h3>
                <div className="custom-scrollbar min-h-0 flex-grow space-y-3 overflow-y-auto pr-2 pt-2">
                    {criticalFailures.length > 0 && (
                        <div>
                            <h4 className="font-bold text-base text-red-600 dark:text-red-500 flex items-center mb-2" title="A critical failure occurs when the model does something it was explicitly told not to do.">
                                <ThumbsDown className="h-5 w-5 mr-2" /> Critical Failures ({criticalFailures.length})
                            </h4>
                            <div className="space-y-3">{renderAssessmentList(criticalFailures)}</div>
                        </div>
                    )}
                    {majorGaps.length > 0 && (
                         <div>
                            <h4 className="font-bold text-base text-orange-600 dark:text-orange-500 flex items-center mb-2" title="A major gap occurs when the model fails to include a key positive requirement.">
                                <AlertTriangle className="h-5 w-5 mr-2" /> Major Gaps ({majorGaps.length})
                            </h4>
                            <div className="space-y-3">{renderAssessmentList(majorGaps)}</div>
                        </div>
                    )}
                    {passed.length > 0 && (
                        <div>
                            <h4 className="font-bold text-base text-green-600 dark:text-green-500 flex items-center mb-2">
                                <CheckCircle className="h-5 w-5 mr-2" /> Passed Criteria ({passed.length})
                            </h4>
                            <div className="space-y-3">{renderAssessmentList(passed)}</div>
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