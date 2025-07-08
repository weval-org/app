'use client';

import React, { useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import {
    ComparisonDataV2 as ImportedComparisonDataV2,
    IndividualJudgement,
    PointAssessment,
    CoverageResult,
} from '@/app/utils/types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { getGradedCoverageColor } from '../utils/colorUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';

// Dynamic imports for icons and markdown
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
const XCircle = dynamic(() => import("lucide-react").then((mod) => mod.XCircle), { ssr: false });
const GitCompareArrows = dynamic(() => import("lucide-react").then((mod) => mod.GitCompareArrows), { ssr: false });

// --- Start: Components adapted from ModelEvaluationDetailModalV2 ---

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

const AssessmentItem: React.FC<{
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

const EvaluationView: React.FC<{
    assessments: PointAssessment[];
    modelResponse: string;
    expandedLogs: Record<number, boolean>,
    toggleLogExpansion: (index: number) => void;
}> = ({ assessments, modelResponse, expandedLogs, toggleLogExpansion }) => {
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

const ScoreSummary: React.FC<{ assessments: PointAssessment[] }> = ({ assessments }) => {
  const summary = useMemo(() => {
    if (!assessments || assessments.length === 0) {
      return { total: 0, passed: 0, criticalFailures: 0, majorGaps: 0 };
    }
    const total = assessments.length;
    let passed = 0;
    let criticalFailures = 0;
    let majorGaps = 0;

    assessments.forEach(a => {
      const score = a.coverageExtent;
      if (score === undefined || score === null || isNaN(score)) return;
      
      if (a.isInverted) {
        if (score < 0.7) criticalFailures++;
        else passed++;
      } else {
        if (score < 0.4) majorGaps++;
        else passed++;
      }
    });
    return { total, passed, criticalFailures, majorGaps };
  }, [assessments]);

  return (
    <div className="p-3 rounded-lg bg-muted/60 dark:bg-slate-800/40 border border-border/80 flex items-center justify-around text-center text-sm">
      <div className="flex flex-col items-center" title="The number of criteria the model successfully met.">
        <span className="text-2xl font-bold text-green-600 dark:text-green-500">{summary.passed}</span>
        <span className="text-xs text-muted-foreground">Passed</span>
      </div>
      <div className="h-10 border-l border-border/80" />
      <div className="flex flex-col items-center" title="The number of negative criteria that the model violated.">
        <span className="text-2xl font-bold text-red-600 dark:text-red-500">{summary.criticalFailures}</span>
        <span className="text-xs text-muted-foreground">Critical Failures</span>
      </div>
      <div className="h-10 border-l border-border/80" />
      <div className="flex flex-col items-center" title="The number of positive criteria that the model failed to meet.">
        <span className="text-2xl font-bold text-orange-600 dark:text-orange-500">{summary.majorGaps}</span>
        <span className="text-xs text-muted-foreground">Major Gaps</span>
      </div>
       <div className="h-10 border-l border-border/80" />
       <div className="flex flex-col items-center" title="The total number of criteria.">
        <span className="text-2xl font-bold text-foreground">{summary.total}</span>
        <span className="text-xs text-muted-foreground">Total Criteria</span>
      </div>
    </div>
  );
};

const ModelCard: React.FC<{
    modelId: string;
    coverageResult: CoverageResult | undefined;
    response: string;
}> = ({ modelId, coverageResult, response }) => {
    const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
    
    const toggleLogExpansion = (index: number) => {
        setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
    };

    if (!coverageResult || 'error' in coverageResult) {
        return (
            <Card className="h-full w-full border-dashed border-destructive/50">
                <CardHeader>
                    <CardTitle>{getModelDisplayLabel(modelId)}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-destructive">Error loading evaluation data for this model: {coverageResult?.error || 'Unknown error'}</p>
                </CardContent>
            </Card>
        )
    }

    const assessments = coverageResult.pointAssessments || [];
    
    return (
        <Card className="w-full flex flex-col flex-1 min-h-0">
            <CardHeader>
                <CardTitle className="text-lg">{getModelDisplayLabel(modelId)}</CardTitle>
                <ScoreSummary assessments={assessments} />
            </CardHeader>
            <CardContent className="flex-grow flex flex-col min-h-0">
                <EvaluationView 
                    assessments={assessments}
                    modelResponse={response}
                    expandedLogs={expandedLogs}
                    toggleLogExpansion={toggleLogExpansion}
                />
            </CardContent>
        </Card>
    );
}

// --- End: Adapted Components ---

// Helper function to calculate model performance summary
const calculateModelSummary = (coverageResult: CoverageResult | undefined) => {
    if (!coverageResult || 'error' in coverageResult || !coverageResult.pointAssessments) {
        return { total: 0, passed: 0, criticalFailures: 0, majorGaps: 0, avgCoverage: 0 };
    }

    const assessments = coverageResult.pointAssessments;
    const total = assessments.length;
    let passed = 0;
    let criticalFailures = 0;
    let majorGaps = 0;

    assessments.forEach(a => {
        const score = a.coverageExtent;
        if (score === undefined || score === null || isNaN(score)) return;
        
        if (a.isInverted) {
            // A 'should not' criterion is passed if it's not present (score >= 0.7)
            if (score < 0.7) criticalFailures++;
            else passed++;
        } else {
            // A 'should' criterion is passed if it's sufficiently present (score >= 0.4)
            if (score < 0.4) majorGaps++;
            else passed++;
        }
    });
    
    const avgCoverage = coverageResult.avgCoverageExtent !== undefined && coverageResult.avgCoverageExtent !== null
        ? Math.round(coverageResult.avgCoverageExtent * 100)
        : 0;

    return { total, passed, criticalFailures, majorGaps, avgCoverage };
};

// Score card component for individual models
const ModelScoreCard: React.FC<{
    displayText: string;
    summary: ReturnType<typeof calculateModelSummary>;
    similarityScore: number | null;
    onClick: () => void;
    isSelected: boolean;
}> = ({ displayText, summary, similarityScore, onClick, isSelected }) => {
    const getAvgCoverageColor = () => {
        if (summary.avgCoverage >= 80) return 'text-green-600 dark:text-green-400';
        if (summary.avgCoverage >= 60) return 'text-orange-600 dark:text-orange-400';
        return 'text-red-600 dark:text-red-400';
    };

    const borderClass = isSelected ? 'border-primary/80' : 'border-border/50';
    const bgClass = isSelected ? 'bg-muted' : 'bg-card hover:bg-muted/50';

    return (
        <button
            onClick={onClick}
            className={cn(
                "w-full p-2 rounded-lg border transition-colors duration-150",
                "flex items-center justify-between gap-3 text-sm group",
                borderClass,
                bgClass,
            )}
            title={displayText}
        >
            <span className="font-medium text-foreground truncate flex-1 text-left">
                {displayText}
            </span>
            
            <div className="flex items-center gap-3 flex-shrink-0">
                {summary.criticalFailures > 0 && (
                    <span className="flex items-center gap-1 text-red-500 font-semibold" title="Critical Failures">
                        <XCircle className="h-4 w-4" />
                        <span>{summary.criticalFailures}</span>
                    </span>
                )}
                {summary.majorGaps > 0 && (
                     <span className="flex items-center gap-1 text-orange-500 font-semibold" title="Major Gaps">
                        <AlertTriangle className="h-4 w-4" />
                         <span>{summary.majorGaps}</span>
                    </span>
                )}
                <div className="flex items-center gap-2">
                    <span className={cn("font-bold text-base", getAvgCoverageColor())} title={`Avg. Coverage: ${summary.avgCoverage}%`}>
                        {summary.avgCoverage}%
                    </span>
                    {similarityScore !== null && (
                        <>
                            <div className="h-4 w-px bg-border" />
                            <span className="flex items-center gap-1 font-semibold text-sky-600 dark:text-sky-400" title={`Similarity to Ideal: ${(similarityScore * 100).toFixed(0)}%`}>
                                <GitCompareArrows className="h-3 w-3" />
                                <span className='text-base'>{Math.round(similarityScore * 100)}</span>
                            </span>
                        </>
                    )}
                </div>
            </div>
        </button>
    );
};

const ModelView: React.FC<{
    displayedModels: string[];
    promptCoverageScores: Record<string, CoverageResult>;
    promptResponses: Record<string, string>;
    systemPrompts?: (string | null)[] | null;
    promptSimilarities: Record<string, Record<string, number>> | null;
}> = ({ displayedModels, promptCoverageScores, promptResponses, systemPrompts, promptSimilarities }) => {
    const [selectedModelId, setSelectedModelId] = useState<string | null>(
        displayedModels.length > 0 ? displayedModels[0] : null
    );

    const groupedModels = useMemo(() => {
        const groups: Record<string, { modelId: string; systemPromptIndex?: number }[]> = {};

        displayedModels.forEach(modelId => {
            const parsed = parseEffectiveModelId(modelId);
            if (!groups[parsed.baseId]) {
                groups[parsed.baseId] = [];
            }
            groups[parsed.baseId].push({
                modelId: modelId,
                systemPromptIndex: parsed.systemPromptIndex,
            });
        });
        
        for (const baseId in groups) {
            groups[baseId].sort((a, b) => (a.systemPromptIndex ?? -1) - (b.systemPromptIndex ?? -1));
        }

        return Object.entries(groups).sort(([baseIdA], [baseIdB]) => baseIdA.localeCompare(baseIdB));

    }, [displayedModels]);

    const selectedModelCoverage = selectedModelId ? promptCoverageScores[selectedModelId] : undefined;
    const selectedModelResponse = selectedModelId ? promptResponses[selectedModelId] : '';

    return (
        <div className="flex flex-col md:flex-row gap-6 mt-4 max-h-[75vh]">
            <div className="md:w-1/3 lg:w-1/4 flex-shrink-0 flex flex-col">
                <p className="text-sm font-semibold text-muted-foreground mb-3 px-1">Models</p>
                <div className="space-y-3 overflow-y-auto custom-scrollbar pr-2">
                    {groupedModels.map(([baseId, variants]) => (
                         <Collapsible key={baseId} defaultOpen={true}>
                            <CollapsibleTrigger className='w-full'>
                                <div className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-muted font-semibold text-primary text-sm">
                                    <span>{getModelDisplayLabel(baseId, { hideProvider: true })}</span>
                                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                                </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-1 pt-1">
                                {variants.map(({ modelId, systemPromptIndex }) => {
                                    const summary = calculateModelSummary(promptCoverageScores[modelId]);
                                    const systemPrompt = (systemPrompts && systemPromptIndex !== undefined) ? systemPrompts[systemPromptIndex] : undefined;
                                    
                                    let displayText = `Sys. Prompt #${systemPromptIndex}`;
                                    if (systemPrompt) {
                                        displayText = `"${systemPrompt}"`;
                                    } else if (systemPrompt === null) {
                                        displayText = '[No System Prompt]';
                                    }

                                    const similarityScore = promptSimilarities && (promptSimilarities[modelId]?.[IDEAL_MODEL_ID] ?? promptSimilarities[IDEAL_MODEL_ID]?.[modelId] ?? null);

                                    return (
                                        <div key={modelId} className="pl-3">
                                            <ModelScoreCard
                                                displayText={displayText}
                                                summary={summary}
                                                similarityScore={similarityScore}
                                                onClick={() => setSelectedModelId(modelId)}
                                                isSelected={selectedModelId === modelId}
                                            />
                                        </div>
                                    );
                                })}
                            </CollapsibleContent>
                        </Collapsible>
                    ))}
                </div>
            </div>
            
            <div className="flex-grow min-w-0 flex flex-col min-h-0">
                 {selectedModelId ? (
                    <ModelCard
                        modelId={selectedModelId}
                        coverageResult={selectedModelCoverage}
                        response={selectedModelResponse}
                    />
                ) : (
                    <div className="flex items-center justify-center h-full p-8 bg-muted/30 rounded-lg">
                        <p className="text-muted-foreground italic">Select a model to view its detailed evaluation.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

interface KeyPointCoverageTableProps {
  data: ImportedComparisonDataV2;
  promptId: string;
  displayedModels: string[]; // List of effective model IDs to display
}

const KeyPointCoverageTable: React.FC<KeyPointCoverageTableProps> = ({
  data,
  promptId,
  displayedModels,
}) => {
  const {
      evaluationResults,
      config,
  } = data;
  
  const promptCoverageScores = useMemo(() => {
      return evaluationResults?.llmCoverageScores?.[promptId] || {};
  }, [evaluationResults, promptId]);

  const promptResponses = useMemo(() => {
    return data.allFinalAssistantResponses?.[promptId] || {};
  }, [data.allFinalAssistantResponses, promptId]);

  const promptSimilarities = useMemo(() => {
    return evaluationResults?.perPromptSimilarities?.[promptId] || null;
  }, [evaluationResults, promptId]);

  if (displayedModels.length === 0) {
    return (
      <div className="p-4 my-4 text-center text-sm bg-muted/50 dark:bg-slate-800/50 rounded-lg ring-1 ring-border dark:ring-slate-700/70 text-muted-foreground dark:text-slate-400">
        No models available for key point coverage analysis.
      </div>
    );
  }

  return (
    <Card className="shadow-lg border-border dark:border-border mt-6">
        <CardHeader>
            <CardTitle className="text-primary">Key Point Coverage Analysis</CardTitle>
            <CardDescription className="text-muted-foreground pt-1 text-sm">
                Select a model on the left to see a detailed breakdown of how its response covers the evaluation criteria.
            </CardDescription>
        </CardHeader>
        <CardContent>
            <ModelView
                displayedModels={displayedModels}
                promptCoverageScores={promptCoverageScores}
                promptResponses={promptResponses}
                systemPrompts={config.systems}
                promptSimilarities={promptSimilarities}
            />
        </CardContent>
    </Card>
  );
};

export default KeyPointCoverageTable; 