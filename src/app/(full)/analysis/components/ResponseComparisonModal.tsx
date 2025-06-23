'use client';

import React, { useEffect, useState, ComponentType } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import dynamic from 'next/dynamic';
import { ConversationMessage } from '@/types/shared';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface SelectedPairInfo {
    modelA: string;
    modelB: string;
    promptId: string;
    similarity: number;
    promptText: string;
}

interface PairResponseContent {
    responseA: string;
    responseB: string;
}

// Type for the LLM Coverage score data passed from the page
interface LLMCoverageScoreData {
    keyPointsCount: number;
    avgCoverageExtent?: number;
    pointAssessments?: PointAssessment[];
}

// Local PointAssessment type, ensure it aligns with the global one after updates
interface PointAssessment {
    keyPointText: string;
    coverageExtent?: number;
    reflection?: string;
    error?: string;
}

interface ResponseComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  modelA: string;
  modelB: string;
  promptContext: string | ConversationMessage[];
  systemPromptA?: string | null;
  systemPromptB?: string | null;
  responseA: string;
  responseB: string;
  semanticSimilarity?: number | null;
  performanceSimilarity?: number | null;
  llmCoverageScoreA?: (LLMCoverageScoreData) | { error: string } | null; // Model A vs Ideal
  llmCoverageScoreB?: (LLMCoverageScoreData) | { error: string } | null; // Model B vs Ideal
  extractedKeyPoints?: string[] | null;
  pointAssessmentsA?: PointAssessment[] | null; // Assessments for Model A vs Ideal
  pointAssessmentsB?: PointAssessment[] | null; // Assessments for Model B vs Ideal
}

// Constant for Ideal Model ID
const IDEAL_MODEL_ID = 'IDEAL_BENCHMARK';

const CheckCircle2 = dynamic(() => import("lucide-react").then((mod) => mod.CheckCircle2));
const XCircle = dynamic(() => import("lucide-react").then((mod) => mod.XCircle));
const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle));
const ChevronsUpDown = dynamic(() => import("lucide-react").then((mod) => mod.ChevronsUpDown));

// Helper to parse model ID
const parseModelId = (modelId: string): { baseName: string; sysPromptIndicator: string | null; hash: string | null } => {
  // Handle potential undefined input gracefully
  if (typeof modelId !== 'string') {
    console.warn("parseModelId received non-string input:", modelId);
    return { baseName: 'Invalid Model', sysPromptIndicator: null, hash: null };
  }
  const match = modelId.match(/^(.*?)(?:(\[sys:([a-f0-9]{8})\]))?$/);
  return {
    baseName: match?.[1] || modelId,
    sysPromptIndicator: match?.[2] || null,
    hash: match?.[3] || null,
  };
};

export function ResponseComparisonModal({
  isOpen,
  onClose,
  modelA,
  modelB,
  promptContext,
  systemPromptA,
  systemPromptB,
  responseA,
  responseB,
  semanticSimilarity,
  performanceSimilarity,
  llmCoverageScoreA,
  llmCoverageScoreB,
  extractedKeyPoints,
  pointAssessmentsA,
  pointAssessmentsB
}: ResponseComparisonModalProps) {

  // Early return if essential data is missing
  if (modelA === undefined || modelB === undefined) {
    console.error("ResponseComparisonModal rendered with undefined modelA or modelB prop.");
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="bg-slate-800 text-slate-100 ring-1 ring-slate-700">
          <DialogHeader>
            <DialogTitle className="text-red-400">Error</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-slate-300">Could not display comparison: Missing model information.</p>
          <DialogFooter>
            <Button variant="outline" onClick={onClose} className="text-sky-300 border-sky-700 hover:bg-sky-700/30 hover:text-sky-200">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
  
  // Props are defined, proceed with parsing
  const { baseName: baseModelA } = parseModelId(modelA);
  const { baseName: baseModelB } = parseModelId(modelB);
  const isComparingVsIdeal = modelB === IDEAL_MODEL_ID;

  const getDisplayPromptString = (context: string | ConversationMessage[]): string => {
    if (typeof context === 'string') {
      return context;
    }
    if (Array.isArray(context)) {
      if (context.length === 1 && context[0].role === 'user') {
        return context[0].content;
      }
      const lastUserMessage = [...context].reverse().find(msg => msg.role === 'user');
      if (lastUserMessage) {
        return `User: ${lastUserMessage.content.substring(0, 150)}${lastUserMessage.content.length > 150 ? '...' : ''}`;
      }
      return `Multi-turn context (${context.length} messages)`;
    }
    return 'Prompt context not available';
  };

  const displayPrompt = getDisplayPromptString(promptContext);

  const [ReactMarkdownComponent, setReactMarkdownComponent] = useState<ComponentType<any> | null>(null);
  const [remarkGfmPlugin, setRemarkGfmPlugin] = useState<any[] | null>(null); // remarkPlugins expects an array

  useEffect(() => {
    // Load ReactMarkdown dynamically
    import('react-markdown').then(mod => {
      setReactMarkdownComponent(() => mod.default); // Use default export
    }).catch(err => console.error("Failed to load react-markdown:", err));

    // Load remarkGfm dynamically
    import('remark-gfm').then(mod => {
      setRemarkGfmPlugin([mod.default]); // Use default export, wrap in array
    }).catch(err => console.error("Failed to load remark-gfm:", err));
  }, []);

  // Function to get similarity badge color
  const getThemedBadgeVariant = (type: 'semantic' | 'performance' | 'coverage' | 'error', score?: number | null): string => {
    if (type === 'error') return "bg-destructive/40 text-destructive-foreground border-destructive/60 hover:bg-destructive/60";
    if (type === 'semantic') return "bg-primary/40 text-primary-foreground border-primary/60 hover:bg-primary/60";
    if (type === 'performance') return "bg-chart-2/40 text-chart-2 border-chart-2/60 hover:bg-chart-2/60";
    if (type === 'coverage') return "bg-chart-4/40 text-chart-4 border-chart-4/60 hover:bg-chart-4/60";
    return "bg-muted text-muted-foreground border-border hover:bg-muted/80";
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col p-0 bg-card/80 dark:bg-slate-800/80 backdrop-blur-lg text-card-foreground ring-1 ring-border dark:ring-slate-700 shadow-lg rounded-xl">
        <DialogHeader className="p-4 border-b border-border dark:border-slate-700 bg-card/60 dark:bg-slate-800/60 sticky top-0 z-10 rounded-t-xl">
          <DialogTitle className="text-primary text-xl">
            Compare Responses
          </DialogTitle>
          <DialogDescription className="text-s text-muted-foreground dark:text-slate-400 pt-1" title={displayPrompt}>
             Prompt: {displayPrompt}
          </DialogDescription>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
            {!isComparingVsIdeal && semanticSimilarity !== undefined && semanticSimilarity !== null && !isNaN(semanticSimilarity) && (
              <Badge className={getThemedBadgeVariant('semantic')}>
                Semantic Similarity (A vs B): {semanticSimilarity.toFixed(4)}
              </Badge>
            )}
            {modelA !== IDEAL_MODEL_ID && llmCoverageScoreA && (
                ('error' in llmCoverageScoreA) ? (
                    <Badge className={getThemedBadgeVariant('error')} title={llmCoverageScoreA.error}>
                        Coverage Error ({baseModelA})
                    </Badge>
                ) : (llmCoverageScoreA.avgCoverageExtent !== undefined && (
                    <Badge className={getThemedBadgeVariant('coverage')}>
                        Avg. Coverage ({baseModelA} vs Ideal): {llmCoverageScoreA.avgCoverageExtent.toFixed(2)}
                        {` (${llmCoverageScoreA.pointAssessments?.filter(p => p.coverageExtent && p.coverageExtent > 0.3).length || 0}/${llmCoverageScoreA.keyPointsCount} points)`} 
                    </Badge>
                ))
            )}
            {!isComparingVsIdeal && modelB !== IDEAL_MODEL_ID && llmCoverageScoreB && (
                ('error' in llmCoverageScoreB) ? (
                    <Badge className={getThemedBadgeVariant('error')} title={llmCoverageScoreB.error}>
                        Coverage Error ({baseModelB})
                    </Badge>
                ) : (llmCoverageScoreB.avgCoverageExtent !== undefined && (
                    <Badge className={getThemedBadgeVariant('coverage')}>
                        Avg. Coverage ({baseModelB} vs Ideal): {llmCoverageScoreB.avgCoverageExtent.toFixed(2)}
                        {` (${llmCoverageScoreB.pointAssessments?.filter(p => p.coverageExtent && p.coverageExtent > 0.3).length || 0}/${llmCoverageScoreB.keyPointsCount} points)`}
                    </Badge>
                ))
            )}
          </div>
        </DialogHeader>
        
        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          {/* NEW: Key Points Summary Table */}
          {extractedKeyPoints && extractedKeyPoints.length > 0 && (
            <div className="mb-4 bg-card/70 dark:bg-slate-800/70 p-3 rounded-lg shadow-md ring-1 ring-border dark:ring-slate-700/70">
              <h4 className="text-sm font-semibold mb-2 text-foreground dark:text-slate-100">Key Point Coverage Summary</h4>
              <div className="overflow-x-auto rounded-md border border-border dark:border-slate-700/80">
                <table className="min-w-full text-xs table-fixed">
                  <thead className="bg-muted/50 dark:bg-slate-900/50">
                    <tr>
                      <th className={`p-2 text-left font-medium text-muted-foreground dark:text-slate-300 ${isComparingVsIdeal ? 'w-1/2' : 'w-2/5'} border-r border-border dark:border-slate-700/80`}>Key Point</th>
                      <th className={`p-2 text-center font-medium text-muted-foreground dark:text-slate-300 ${isComparingVsIdeal ? 'w-1/2' : 'w-[30%]'} border-r border-border dark:border-slate-700/80`} title={modelA}>{baseModelA}</th>
                      {!isComparingVsIdeal && (
                        <th className="p-2 text-center font-medium text-muted-foreground dark:text-slate-300 w-[30%]" title={modelB}>{baseModelB}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border dark:divide-slate-700/80 bg-card dark:bg-slate-800">
                    {extractedKeyPoints.map((keyPoint, index) => {
                      const assessmentA = pointAssessmentsA?.find(p => p.keyPointText === keyPoint) || pointAssessmentsA?.[index];
                      const assessmentB = !isComparingVsIdeal && modelB !== IDEAL_MODEL_ID ? (pointAssessmentsB?.find(p => p.keyPointText === keyPoint) || pointAssessmentsB?.[index]) : null;

                      const renderCellContent = (assessment: PointAssessment | undefined | null, isIdealCol: boolean = false) => {
                        if (isIdealCol) { // Should not be called for Ideal if Ideal column is removed, but safe handling
                            return (
                                <div title="Met by definition" className="flex items-center justify-center w-full h-full">
                                    {CheckCircle2 && <CheckCircle2 className="w-3.h-3.5 text-green-500 dark:text-green-400" />}
                                </div>
                            );
                        }
                        
                        // Compute tooltipText first
                        let tooltipText = "";
                        if (assessment) {
                            if (assessment.error) {
                                tooltipText = `Error: ${assessment.error}`;
                                if (assessment.reflection) tooltipText += `\nReflection: ${assessment.reflection}`;
                                if (assessment.coverageExtent !== undefined) tooltipText += `\nExtent: ${assessment.coverageExtent.toFixed(2)}`;
                            } else {
                                if (assessment.reflection) tooltipText += `Reflection: ${assessment.reflection}`;
                                if (assessment.coverageExtent !== undefined) {
                                    tooltipText += `${tooltipText ? '\n' : ''}Extent: ${assessment.coverageExtent.toFixed(2)}`;
                                }
                            }
                        } else {
                            tooltipText = "Assessment data missing";
                        }

                        // Prepare content parts
                        let iconPart: React.ReactNode = null;
                        let reflectionPart: React.ReactNode = null;

                        if (!assessment) {
                            iconPart = <span className="text-slate-500 dark:text-slate-400">-</span>;
                        } else {
                            if (assessment.reflection) {
                                reflectionPart = (
                                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 italic whitespace-normal text-left px-1 text-opacity-90 leading-tight hyphens-auto">
                                        {assessment.reflection}
                                    </p>
                                );
                            }

                            if (assessment.error) {
                                iconPart = (
                                    <div className="flex items-center justify-center">
                                        {AlertCircle && <AlertCircle className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />}
                                    </div>
                                );
                            } else {
                                const extent = assessment.coverageExtent;
                                const isConsideredPresent = extent !== undefined && extent > 0.3;

                                if (isConsideredPresent) {
                                    let extentText = "";
                                    if (extent !== undefined && extent < 1.0 && extent > 0.0) {
                                        extentText = `(${extent.toFixed(2)})`;
                                    }
                                    iconPart = (
                                        <div className="flex items-center justify-center">
                                            {CheckCircle2 && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 dark:text-green-400" />}
                                            {extentText && <span className="ml-1 text-green-700 dark:text-green-300 text-[10px]">{extentText}</span>}
                                        </div>
                                    );
                                    if (!tooltipText && !assessment.reflection) tooltipText = 'Met'; 
                                } else {
                                    iconPart = (
                                        <div className="flex items-center justify-center">
                                            {XCircle && <XCircle className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />}
                                        </div>
                                    );
                                    if (!tooltipText && !assessment.reflection) tooltipText = 'Not Met';
                                }
                            }
                        }

                        return (
                            <div title={tooltipText} className="w-full h-full flex flex-col justify-start pt-0.5">
                                {iconPart}
                                {reflectionPart}
                            </div>
                        );
                      };

                      return (
                        <tr key={index} className="hover:bg-muted/30 dark:hover:bg-slate-700/30 transition-colors">
                          <td className="p-2 align-top border-r border-border dark:border-slate-700/80 text-foreground dark:text-slate-200 whitespace-normal">{keyPoint}</td>
                          <td className="p-2 text-center align-middle border-r border-border dark:border-slate-700/80">
                            {renderCellContent(assessmentA)}
                          </td>
                          {!isComparingVsIdeal && (
                            <td className="p-2 text-center align-middle">
                              {renderCellContent(assessmentB)}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Existing ResponsePanels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ResponsePanel 
              title={baseModelA}
              fullModelId={modelA}
              response={responseA}
              systemPrompt={systemPromptA}
              ReactMarkdownComponent={ReactMarkdownComponent}
              remarkGfmPlugin={remarkGfmPlugin}
            />
            <ResponsePanel 
              title={isComparingVsIdeal ? 'Ideal Response' : baseModelB}
              fullModelId={modelB}
              response={responseB}
              systemPrompt={systemPromptB}
              isIdeal={isComparingVsIdeal}
              ReactMarkdownComponent={ReactMarkdownComponent}
              remarkGfmPlugin={remarkGfmPlugin}
            />
          </div>
        </div>
        
        <DialogFooter className="p-2 border-t border-border dark:border-slate-700 bg-card/60 dark:bg-slate-800/60 sticky bottom-0 z-10 rounded-b-xl">
          <Button variant="outline" onClick={onClose} className="text-primary border-primary/50 hover:bg-primary/10 hover:text-primary dark:text-sky-300 dark:border-sky-700 dark:hover:bg-sky-700/30 dark:hover:text-sky-200">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Sub-component for displaying a single model's response
function ResponsePanel({
  title,
  fullModelId,
  response,
  systemPrompt,
  isIdeal = false,
  ReactMarkdownComponent,
  remarkGfmPlugin,
}: {
  title: string;
  fullModelId: string;
  response: string;
  systemPrompt?: string | null;
  isIdeal?: boolean;
  ReactMarkdownComponent: ComponentType<any> | null;
  remarkGfmPlugin: any[] | null;
}) {
  const { baseName: modelBaseName, sysPromptIndicator } = parseModelId(fullModelId);
  const effectiveTitle = isIdeal ? title : modelBaseName;

  return (
    <div className="bg-card/70 dark:bg-slate-800/70 p-3 rounded-lg shadow-inner ring-1 ring-border dark:ring-slate-700/70 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-base font-semibold text-foreground dark:text-slate-100">
            {effectiveTitle}
        </h3>
        {sysPromptIndicator && !isIdeal && (
            <Badge variant="outline" className="text-xs font-mono border-amber-500/50 text-amber-600 dark:text-amber-400" title={`Full ID: ${fullModelId}`}>
                {sysPromptIndicator}
            </Badge>
        )}
      </div>
      
      {systemPrompt && (
          <Collapsible>
              <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-start px-2 mb-2 text-sky-800 dark:text-sky-300 hover:bg-sky-100/50 dark:hover:bg-sky-900/30">
                      <ChevronsUpDown className="w-3 h-3 mr-2" />
                      <span className="text-xs font-semibold">View System Prompt</span>
                  </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                  <div className="mb-2 p-2 rounded-md bg-sky-100/50 dark:bg-sky-900/30 text-xs text-sky-800 dark:text-sky-200 ring-1 ring-sky-200 dark:ring-sky-800">
                      <p className="whitespace-pre-wrap font-mono">{systemPrompt}</p>
                  </div>
              </CollapsibleContent>
          </Collapsible>
      )}

      <div className="prose prose-sm dark:prose-invert max-w-none flex-grow overflow-y-auto custom-scrollbar pr-1 text-card-foreground dark:text-slate-200">
        {ReactMarkdownComponent && remarkGfmPlugin ? (
          <ReactMarkdownComponent remarkPlugins={remarkGfmPlugin}>
            {response}
          </ReactMarkdownComponent>
        ) : (
          <pre className="whitespace-pre-wrap font-sans">{response}</pre>
        )}
      </div>
    </div>
  );
} 