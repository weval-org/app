'use client';

import React, { useState, ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { ConversationMessage, IndividualJudgement } from '../../../app/utils/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const MessageSquare = dynamic(() => import('lucide-react').then(mod => mod.MessageSquare));
const ChevronDown = dynamic(() => import('lucide-react').then(mod => mod.ChevronDown));
const ChevronUp = dynamic(() => import('lucide-react').then(mod => mod.ChevronUp));
const Quote = dynamic(() => import('lucide-react').then(mod => mod.Quote));
const Server = dynamic(() => import('lucide-react').then(mod => mod.Server));

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

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
  baseModelId: string; // The model without permutation params, for display
  promptContext: string | ConversationMessage[];
  promptDescription?: string;
  // Map from system prompt index to the evaluation data for that variant
  variantEvaluations: Map<number, ModelEvaluationVariant>;
  initialVariantIndex: number; // which tab to open first
}

interface ModelEvaluationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ModelEvaluationDetailModalData;
}

const getScoreColor = (score?: number): string => {
    if (score === undefined || score === null || isNaN(score)) return 'bg-slate-500'; // Neutral for undefined
    if (score >= 0.7) return 'bg-green-600';
    if (score >= 0.4) return 'bg-yellow-500';
    return 'bg-red-600';
};

const getInvertedScoreColor = (score?: number): string => {
    if (score === undefined || score === null || isNaN(score)) return 'bg-slate-500'; // Neutral for undefined
    // For inverted scores, high is good (green), low is bad (red)
    if (score >= 0.7) return 'bg-green-600';
    if (score >= 0.4) return 'bg-yellow-500';
    return 'bg-red-600';
};

const PromptContextDisplay: React.FC<{ promptContext: string | ConversationMessage[] }> = ({ promptContext }) => {
    if (typeof promptContext === 'string') {
      return <div className="whitespace-pre-wrap">{promptContext}</div>;
    }
    if (Array.isArray(promptContext) && promptContext.length > 0) {
      return (
        <div className="space-y-1 mt-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
          {promptContext.map((msg, index) => (
            <div key={index} className={`p-1.5 rounded-md text-xs ${msg.role === 'user' ? 'bg-sky-100 dark:bg-sky-900/30' : msg.role === 'assistant' ? 'bg-slate-100 dark:bg-slate-800/30' : 'bg-gray-100 dark:bg-gray-700/30'}`}>
              <p className="text-[12px] font-semibold text-muted-foreground dark:text-slate-400 capitalize">{msg.role}</p>
              <p className="text-sm text-card-foreground dark:text-slate-200 whitespace-pre-wrap">{msg.content}</p>
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
}> = ({ assessment, index, isLogExpanded, toggleLogExpansion }) => {
    console.log(`[ModelEvaluationDetailModal] Rendering assessment for KP "${assessment.keyPointText}":`, assessment);
    const scoreColor = assessment.isInverted ? getInvertedScoreColor(assessment.coverageExtent) : getScoreColor(assessment.coverageExtent);

    return (
        <div className="p-3 rounded-md border border-border/70 dark:border-slate-700/60 bg-card/50 dark:bg-slate-800/50 shadow-sm">
            <div className="flex justify-between items-start">
                <h4 className="font-semibold text-sm text-primary mb-1.5">{assessment.keyPointText}</h4>
                {assessment.isInverted && (
                    <Badge variant="destructive" className="text-xs font-normal whitespace-nowrap ml-2" title="This is a 'should not' criterion.">
                        NOT
                    </Badge>
                )}
            </div>
            {assessment.citation && (
            <div className="flex items-start space-x-1.5 mb-2 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-2">
                <Quote className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{assessment.citation}</span>
            </div>
            )}
            <div className="space-y-1.5">
            {assessment.error && (
                <Badge variant="destructive" className="text-xs flex items-center space-x-1.5 py-1 px-2 w-full justify-start">
                <AlertTriangle className="h-3 w-3" />
                <span>Error: {assessment.error}</span>
                </Badge>
            )}
            <div className="flex items-center space-x-2">
                <span className="font-medium text-xs text-muted-foreground">Score:</span>
                {typeof assessment.coverageExtent === 'number' && !isNaN(assessment.coverageExtent) ? (
                <Badge className={`text-xs text-white ${scoreColor}`}>
                    {assessment.coverageExtent.toFixed(2)}
                </Badge>
                ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">N/A</Badge>
                )}
                {assessment.multiplier && assessment.multiplier !== 1 && (
                <Badge variant="secondary" className="text-xs font-normal" title={`Score is weighted by this multiplier.`}>
                    &times;{assessment.multiplier}
                </Badge>
                )}
            </div>
            <div className="flex items-start space-x-1.5">
                <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div>
                <span className="font-medium text-xs text-muted-foreground">Reflection:</span>
                {assessment.reflection ? (
                    <p className="text-xs text-muted-foreground/80 italic pl-1 whitespace-pre-wrap">{assessment.reflection}</p>
                ) : (
                    <p className="text-xs text-muted-foreground/80 italic pl-1">No reflection provided.</p>
                )}
                </div>
            </div>

            {assessment.individualJudgements && assessment.individualJudgements.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50">
                    <h5 className="font-semibold text-xs text-muted-foreground mb-1.5">Consensus Breakdown:</h5>
                    <div className="space-y-2 pl-2 border-l-2 border-border/50">
                        {assessment.individualJudgements.map((judgement, j_index) => (
                            <div key={j_index} className="text-xs">
                                <div className="flex items-center space-x-2">
                                    <Badge variant="secondary" className="font-normal">{getModelDisplayLabel(judgement.judgeModelId)}</Badge>
                                    <Badge className={`text-white ${assessment.isInverted ? getInvertedScoreColor(judgement.coverageExtent) : getScoreColor(judgement.coverageExtent)}`}>{judgement.coverageExtent.toFixed(2)}</Badge>
                                </div>
                                <p className="text-muted-foreground/80 italic pl-1 mt-1 whitespace-pre-wrap">{judgement.reflection}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {(assessment.judgeModelId || assessment.judgeLog) && (
                <div className="flex items-start space-x-1.5 pt-2 border-t border-border/50 mt-2">
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
                                    {assessment.judgeLog.join('\\n')}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}
            </div>
        </div>
    );
};

const EvaluationView: React.FC<{
    variant: ModelEvaluationVariant,
    expandedLogs: Record<number, boolean>,
    toggleLogExpansion: (index: number) => void;
}> = ({ variant, expandedLogs, toggleLogExpansion }) => {
    const { modelResponse, assessments } = variant;

    return (
        <div className="flex-1 px-3 text-sm flex flex-col lg:flex-row lg:space-x-3 overflow-hidden min-h-0"> 
          <div className="lg:w-2/5 flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 flex flex-col p-3 bg-muted/10 dark:bg-slate-800/20 rounded-lg overflow-hidden border border-border/50">
              <p className="font-semibold text-muted-foreground text-sm mb-1.5 pb-1 border-b border-border/30">Model Response</p>
              <div className="flex-grow overflow-y-auto custom-scrollbar pr-1">
                {modelResponse ? (
                  <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]} className="prose prose-sm dark:prose-invert max-w-none">{modelResponse}</ReactMarkdown>
                ) : (
                  <p className="italic text-muted-foreground">No response text available.</p>
                )}
              </div>
            </div>
          </div>

          <div className="lg:w-3/5 flex flex-col mt-6 lg:mt-0 overflow-hidden">
            <div className="flex-1 min-h-0 flex flex-col p-3 bg-muted/10 dark:bg-slate-800/20 rounded-lg overflow-hidden border border-border/50">
              <h3 className="font-semibold text-muted-foreground text-sm mb-1.5 pb-1 border-b border-border/30 sticky top-0 z-10">
                Criteria Evaluation ({assessments.length})
              </h3>
              <div className="flex-grow overflow-y-auto custom-scrollbar space-y-3 pr-1 pt-1">
                {assessments && assessments.length > 0 ? (
                  assessments.map((assessment, index) => (
                    <AssessmentItem 
                        key={index}
                        assessment={assessment}
                        index={index}
                        isLogExpanded={expandedLogs[index]}
                        toggleLogExpansion={toggleLogExpansion}
                    />
                  ))
                ) : (
                  <p className="text-muted-foreground italic text-sm">No specific criteria assessments available for this model response.</p>
                )}
              </div>
            </div>
          </div>
        </div>
    );
};

const ModelEvaluationDetailModal: React.FC<ModelEvaluationDetailModalProps> = ({ isOpen, onClose, data }) => {
  if (!isOpen) return null;

  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});

  const { baseModelId, promptContext, promptDescription, variantEvaluations, initialVariantIndex } = data;
  const displayModelName = getModelDisplayLabel(baseModelId);
  
  const variantKeys = Array.from(variantEvaluations.keys()).sort((a,b) => a-b);
  const hasMultipleVariants = variantKeys.length > 1;

  const toggleLogExpansion = (index: number) => {
    setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="text-xl font-semibold text-foreground">
            Evaluation Details for: <span className="text-primary">{displayModelName}</span>
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

        {hasMultipleVariants ? (
            <Tabs defaultValue={String(initialVariantIndex)} className="flex-1 flex flex-col min-h-0">
                <div className="px-6 py-2 border-b">
                    <TabsList>
                        {variantKeys.map(index => {
                            const variant = variantEvaluations.get(index);
                             const systemPromptText = variant?.systemPrompt || "[No System Prompt]";
                            return (
                                <TooltipProvider key={index} delayDuration={100}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <TabsTrigger value={String(index)}>
                                                Variant (sp_idx:{index})
                                            </TabsTrigger>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-md">
                                            <p className="text-xs font-semibold mb-1">System Prompt:</p>
                                            <p className="text-xs whitespace-pre-wrap">{systemPromptText}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )
                        })}
                    </TabsList>
                </div>
                 {variantKeys.map(index => {
                    const variantData = variantEvaluations.get(index);
                    if (!variantData) return null;
                    return (
                        <TabsContent key={index} value={String(index)} className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
                            <EvaluationView 
                                variant={variantData} 
                                expandedLogs={expandedLogs}
                                toggleLogExpansion={toggleLogExpansion}
                            />
                        </TabsContent>
                    )
                })}
            </Tabs>
        ) : (
            <EvaluationView 
                variant={variantEvaluations.get(initialVariantIndex)!}
                expandedLogs={expandedLogs}
                toggleLogExpansion={toggleLogExpansion}
            />
        )}


        <DialogFooter className="p-4 border-t border-border bg-muted/30 dark:bg-slate-900/50">
          <Button onClick={onClose} variant="outline">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModelEvaluationDetailModal; 