'use client';

import React, { useState, useMemo, ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { IndividualJudgement } from '@/app/utils/types';
import { ConversationMessage } from '@/types/shared';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle), { ssr: false });
const MessageSquare = dynamic(() => import('lucide-react').then(mod => mod.MessageSquare), { ssr: false });
const ChevronDown = dynamic(() => import('lucide-react').then(mod => mod.ChevronDown), { ssr: false });
const ChevronUp = dynamic(() => import('lucide-react').then(mod => mod.ChevronUp), { ssr: false });
const ChevronsUpDown = dynamic(() => import('lucide-react').then(mod => mod.ChevronsUpDown), { ssr: false });
const Quote = dynamic(() => import('lucide-react').then(mod => mod.Quote), { ssr: false });
const Server = dynamic(() => import('lucide-react').then(mod => mod.Server), { ssr: false });
const CheckCircle = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle), { ssr: false });
const XCircle = dynamic(() => import('lucide-react').then(mod => mod.XCircle), { ssr: false });
const ThumbsDown = dynamic(() => import('lucide-react').then(mod => mod.ThumbsDown), { ssr: false });
const User = dynamic(() => import('lucide-react').then(mod => mod.User), { ssr: false });
const Bot = dynamic(() => import('lucide-react').then(mod => mod.Bot), { ssr: false });
const Terminal = dynamic(() => import('lucide-react').then(mod => mod.Terminal), { ssr: false });

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

const parseJudgeId = (judgeId: string): { approach: string, model: string } => {
    const match = judgeId.match(/^([\w-]+)\((.*)\)$/);
    if (match && match[1] && match[2]) {
        return { approach: match[1], model: getModelDisplayLabel(match[2]) };
    }
    return { approach: 'Custom', model: getModelDisplayLabel(judgeId) };
};

export type { PointAssessment, ModelEvaluationVariant, ModelEvaluationDetailModalData };

interface PointAssessment {
    keyPointText: string;
    coverageExtent?: number;
    reflection?: string;
    error?: string;
    multiplier?: number;
    citation?: string;
    judgeModelId?: string;
    judgeLog?: string[];
    individualJudgements?: IndividualJudgement[];
    isInverted?: boolean;
}

interface ModelEvaluationVariant {
    modelId: string;
    assessments: PointAssessment[];
    modelResponse: string;
    systemPrompt: string | null;
}

interface ModelEvaluationDetailModalData {
  baseModelId: string;
  promptContext: string | ConversationMessage[];
  promptDescription?: string;
  variantEvaluations: Map<number, ModelEvaluationVariant>;
  initialVariantIndex: number;
}

interface ModelEvaluationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ModelEvaluationDetailModalData;
}

const getScoreColor = (score?: number): string => {
    if (score === undefined || score === null || isNaN(score)) return 'bg-slate-500';
    if (score >= 0.7) return 'bg-green-600';
    if (score >= 0.4) return 'bg-yellow-500';
    return 'bg-red-600';
};

const getRoleIcon = (role: 'user' | 'assistant' | 'system'): React.ReactNode => {
    switch (role) {
        case 'user':
            return <User className="h-5 w-5 text-sky-800 dark:text-sky-300" />;
        case 'assistant':
            return <Bot className="h-5 w-5 text-slate-800 dark:text-slate-300" />;
        case 'system':
            return <Terminal className="h-5 w-5 text-gray-800 dark:text-gray-300" />;
        default:
            return null;
    }
};

const PromptContextDisplay: React.FC<{ promptContext: string | ConversationMessage[] }> = ({ promptContext }) => {
    if (typeof promptContext === 'string') {
        return (
            <div className="mt-2 prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm p-3 bg-muted/50 rounded-md border">
                <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                    {promptContext}
                </ReactMarkdown>
            </div>
        );
    }
    if (Array.isArray(promptContext) && promptContext.length > 0) {
      return (
        <div className="space-y-4 mt-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
          {promptContext.map((msg, index) => (
            <div key={index} className="flex items-start gap-3">
                <div className={cn(
                    "rounded-full p-2",
                    msg.role === 'user' ? 'bg-sky-100 dark:bg-sky-900/40' : 
                    msg.role === 'assistant' ? 'bg-slate-200 dark:bg-slate-700/40' : 
                    'bg-gray-200 dark:bg-gray-700/40'
                )}>
                    {getRoleIcon(msg.role as any)}
                </div>
                <div className="flex-1 pt-1">
                    <p className="text-sm font-bold text-muted-foreground/90 dark:text-slate-400 capitalize">{msg.role}</p>
                    <div className="prose prose-sm dark:prose-invert max-w-none text-foreground dark:text-slate-200 whitespace-pre-wrap pt-1">
                        <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                            {msg.content}
                        </ReactMarkdown>
                    </div>
                </div>
            </div>
          ))}
        </div>
      );
    }
    return <p className="italic">Prompt context not available.</p>;
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
                    // Negative criteria are binary: pass (green) or fail (red)
                    (assessment.coverageExtent !== undefined && assessment.coverageExtent >= 0.7 ? "border-green-600 bg-green-50/50 dark:bg-green-900/10" : "border-red-600 bg-red-50/50 dark:bg-red-900/10") :
                    // Positive criteria are tiered: strong pass (green), partial pass (yellow), major gap (orange)
                    (
                        assessment.coverageExtent !== undefined ?
                            assessment.coverageExtent >= 0.7 ? "border-green-600 bg-green-50/50 dark:bg-green-900/10" :
                            assessment.coverageExtent >= 0.4 ? "border-yellow-500 bg-yellow-50/50 dark:bg-yellow-900/10" :
                            "border-orange-500 bg-orange-50/50 dark:bg-orange-900/10"
                        : "border-slate-300 bg-card/50 dark:border-slate-700 dark:bg-slate-800/20" // Fallback for undefined scores
                    )
            )}>
                <CollapsibleTrigger asChild>
                    <div className="flex justify-between items-center cursor-pointer p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                        <h4 className="font-semibold text-sm text-primary pr-2 flex-1 text-left">{assessment.keyPointText}</h4>
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
                    </div>
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
                                    <Button variant="ghost" className="text-xs h-7 px-2 w-full justify-start text-muted-foreground hover:text-foreground">
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
                                            <Button variant="ghost" onClick={() => toggleLogExpansion(index)} className="text-xs h-6 px-2">
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
    variant: ModelEvaluationVariant,
    expandedLogs: Record<number, boolean>,
    toggleLogExpansion: (index: number) => void;
}> = ({ variant, expandedLogs, toggleLogExpansion }) => {
    const { modelResponse, assessments } = variant;
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
        
        // Sort within categories for consistency
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
                    isLogExpanded={expandedLogs[originalIndex]}
                    toggleLogExpansion={toggleLogExpansion}
                    isExpanded={expandedAssessments.has(originalIndex)}
                    toggleExpansion={() => toggleAssessmentExpansion(originalIndex)}
                />
            )
        })
    );

    return (
        <div className="flex-1 px-4 text-sm flex flex-col lg:flex-row lg:space-x-4 overflow-hidden min-h-0"> 
            <div className="lg:w-2/5 flex flex-col overflow-hidden">
                <div className="flex-1 min-h-0 flex flex-col p-3 bg-muted/20 dark:bg-slate-800/20 rounded-lg overflow-hidden border border-border/50">
                    <p className="font-semibold text-muted-foreground text-sm mb-1.5 pb-1 border-b border-border/30">Model Response</p>
                    <div className="flex-grow overflow-y-auto custom-scrollbar pr-2">
                        {modelResponse ? (
                            <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]} className="prose prose-sm dark:prose-invert max-w-none">{modelResponse}</ReactMarkdown>
                        ) : (
                            <p className="italic text-muted-foreground">No response text available.</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="lg:w-3/5 flex flex-col mt-6 lg:mt-0 overflow-hidden">
                <div className="flex-1 min-h-0 flex flex-col p-3 bg-muted/20 dark:bg-slate-800/20 rounded-lg overflow-hidden border border-border/50">
                    <h3 className="font-semibold text-muted-foreground text-sm mb-1.5 pb-1 border-b border-border/30 sticky top-0 z-10">
                        Criteria Evaluation ({assessments.length})
                    </h3>
                    <div className="flex-grow overflow-y-auto custom-scrollbar space-y-4 pr-2 pt-2">
                        {criticalFailures.length > 0 && (
                            <div>
                                <h4 
                                    className="font-bold text-base text-red-600 dark:text-red-500 flex items-center mb-2"
                                    title="A critical failure occurs when the model does something it was explicitly told not to do (a 'should_not' violation)."
                                >
                                    <ThumbsDown className="h-5 w-5 mr-2" />
                                    Critical Failures ({criticalFailures.length})
                                </h4>
                                <div className="space-y-3">{renderAssessmentList(criticalFailures)}</div>
                            </div>
                        )}
                        {majorGaps.length > 0 && (
                            <div>
                                <h4 
                                    className="font-bold text-base text-orange-600 dark:text-orange-500 flex items-center mb-2"
                                    title="A major gap occurs when the model fails to include a key positive requirement of the prompt (a 'should' omission)."
                                >
                                    <AlertTriangle className="h-5 w-5 mr-2" />
                                    Major Gaps ({majorGaps.length})
                                </h4>
                                <div className="space-y-3">{renderAssessmentList(majorGaps)}</div>
                            </div>
                        )}
                        {passed.length > 0 && (
                            <div>
                                <h4 className="font-bold text-base text-green-600 dark:text-green-500 flex items-center mb-2">
                                    <CheckCircle className="h-5 w-5 mr-2" />
                                    Passed Criteria ({passed.length})
                                </h4>
                                <div className="space-y-3">{renderAssessmentList(passed)}</div>
                            </div>
                        )}
                        {assessments.length === 0 && (
                            <p className="text-muted-foreground italic text-sm">No specific criteria assessments available for this model response.</p>
                        )}
                    </div>
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
      <div className="flex flex-col items-center" title="The number of negative criteria ('should_not') that the model violated.">
        <span className="text-2xl font-bold text-red-600 dark:text-red-500">{summary.criticalFailures}</span>
        <span className="text-xs text-muted-foreground">Critical Failures</span>
      </div>
      <div className="h-10 border-l border-border/80" />
      <div className="flex flex-col items-center" title="The number of positive criteria ('should') that the model failed to meet.">
        <span className="text-2xl font-bold text-orange-600 dark:text-orange-500">{summary.majorGaps}</span>
        <span className="text-xs text-muted-foreground">Major Gaps</span>
      </div>
       <div className="h-10 border-l border-border/80" />
       <div className="flex flex-col items-center" title="The total number of criteria defined in the evaluation rubric.">
        <span className="text-2xl font-bold text-foreground">{summary.total}</span>
        <span className="text-xs text-muted-foreground">Total Criteria</span>
      </div>
    </div>
  );
};


const ModelEvaluationDetailModalV2: React.FC<ModelEvaluationDetailModalProps> = ({ isOpen, onClose, data }) => {
  if (!isOpen) return null;

  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const { baseModelId, promptContext, promptDescription, variantEvaluations, initialVariantIndex } = data;
  
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(initialVariantIndex);

  const displayModelName = getModelDisplayLabel(baseModelId);
  
  const variantKeys = Array.from(variantEvaluations.keys()).sort((a,b) => a-b);
  const hasMultipleVariants = variantKeys.length > 1;

  const currentVariant = variantEvaluations.get(selectedVariantIndex);

  const toggleLogExpansion = (index: number) => {
    setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
  };

  if (!currentVariant) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader><DialogTitle>Error</DialogTitle></DialogHeader>
                <p>Could not find evaluation data for the selected variant.</p>
                <DialogFooter><Button onClick={onClose} variant="outline">Close</Button></DialogFooter>
            </DialogContent>
        </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 md:p-6 pb-3 border-b border-border">
          <DialogTitle className="text-xl font-semibold text-foreground">
            Evaluation for: <span className="text-primary">{displayModelName}</span>
          </DialogTitle>
          <div className="text-sm text-muted-foreground max-h-32 overflow-y-auto custom-scrollbar pr-2 space-y-2">
            {promptDescription && (
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1 text-xs">
                    <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{promptDescription}</ReactMarkdown>
                </div>
            )}
            <div>
              <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground/80">Prompt:</p>
              <PromptContextDisplay promptContext={promptContext} />
            </div>
          </div>
        </DialogHeader>
        
        <div className="flex-1 flex flex-col min-h-0">
            {hasMultipleVariants && (
                <div className="px-6 py-3 border-b-2 border-primary/10 bg-muted/40">
                    <RadioGroup 
                        value={String(selectedVariantIndex)} 
                        onValueChange={(value) => setSelectedVariantIndex(Number(value))}
                        className="flex items-center gap-x-4 gap-y-2 flex-wrap"
                    >
                        <Label className="text-sm font-semibold text-foreground mr-4">System Prompt Variant:</Label>
                        {variantKeys.map(index => {
                            const variant = variantEvaluations.get(index);
                            const systemPromptText = variant?.systemPrompt || "[Default System Prompt]";
                            return (
                                <div key={index} className="flex items-center space-x-2">
                                    <RadioGroupItem value={String(index)} id={`variant-${index}`} />
                                    <Label htmlFor={`variant-${index}`} className="font-normal cursor-pointer" title={systemPromptText}>
                                        <span className="block max-w-xs truncate text-sm">
                                            {systemPromptText}
                                        </span>
                                    </Label>
                                </div>
                            )
                        })}
                    </RadioGroup>
                </div>
            )}
            
            <div className="px-4 md:px-6 pt-4 pb-2 space-y-3">
                {currentVariant.systemPrompt ? (
                    <div className="p-2 rounded-md bg-sky-100/50 dark:bg-sky-900/30 text-xs text-sky-800 dark:text-sky-200 ring-1 ring-sky-200 dark:ring-sky-800">
                        <p className="font-semibold text-sky-900 dark:text-sky-300">System Prompt (for Variant {selectedVariantIndex}):</p>
                        <p className="whitespace-pre-wrap font-mono">{currentVariant.systemPrompt}</p>
                    </div>
                ) : (
                    <div className="p-2 rounded-md bg-slate-100/50 dark:bg-slate-900/30 text-xs text-slate-500 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-800">
                        <p className="italic">[No System Prompt was used for this variant]</p>
                    </div>
                )}
                <ScoreSummary assessments={currentVariant.assessments} />
            </div>

            <EvaluationView 
                variant={currentVariant}
                expandedLogs={expandedLogs}
                toggleLogExpansion={toggleLogExpansion}
            />
        </div>

        <DialogFooter className="p-4 border-t border-border bg-muted/30 dark:bg-slate-900/50">
          <Button onClick={onClose} variant="outline">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModelEvaluationDetailModalV2; 