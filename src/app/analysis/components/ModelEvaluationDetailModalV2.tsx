'use client';

import React, { useState, useMemo, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { IndividualJudgement, PointAssessment } from '@/app/utils/types';
import { ConversationMessage } from '@/types/shared';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import PromptContextDisplay from './PromptContextDisplay';
import { EvaluationView } from './SharedEvaluationComponents';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const Quote = dynamic(() => import('lucide-react').then(mod => mod.Quote), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

export type { ModelEvaluationVariant, ModelEvaluationDetailModalData };

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
  promptCitation?: string;
  variantEvaluations: Map<number, ModelEvaluationVariant>;
  initialVariantIndex: number;
  idealResponse?: string;
}

interface ModelEvaluationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ModelEvaluationDetailModalData;
}

const ModelEvaluationDetailModalV2: React.FC<ModelEvaluationDetailModalProps> = ({ isOpen, onClose, data }) => {
  if (!isOpen) return null;

  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [isMobileView, setIsMobileView] = useState(false);
  const { baseModelId, promptContext, promptDescription, promptCitation, variantEvaluations, initialVariantIndex, idealResponse } = data;
  
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(initialVariantIndex);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 768); // md breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  // Mobile: Use dedicated full-screen mobile experience
  if (isMobileView) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[100vw] h-[100vh] max-w-none p-0 m-0 rounded-none border-0 bg-background flex flex-col overflow-hidden">
          {/* Hidden title for accessibility */}
          <DialogTitle className="sr-only">Model Evaluation Details - Mobile View</DialogTitle>
          
          <div className="h-full flex flex-col min-h-0">
            {/* Mobile Header */}
            <div className="flex items-center gap-3 p-4 border-b bg-card flex-shrink-0">
              <Button 
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted rounded-lg transition-colors min-h-[44px]"
              >
                <span className="font-medium">Close</span>
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-lg truncate">{displayModelName}</h2>
                {promptDescription && (
                  <p className="text-sm text-muted-foreground truncate">{promptDescription}</p>
                )}
              </div>
            </div>

            {/* System Prompt Variant Selection (Mobile) */}
            {hasMultipleVariants && (
              <div className="px-4 py-3 border-b bg-muted/40 flex-shrink-0">
                <RadioGroup 
                  value={String(selectedVariantIndex)} 
                  onValueChange={(value) => setSelectedVariantIndex(Number(value))}
                  className="space-y-2"
                >
                  <Label className="text-sm font-semibold text-foreground">System Prompt Variant:</Label>
                  {variantKeys.map(index => {
                    const variant = variantEvaluations.get(index);
                    const systemPromptText = variant?.systemPrompt || "[Default System Prompt]";
                    return (
                      <div key={index} className="flex items-start space-x-2">
                        <RadioGroupItem value={String(index)} id={`mobile-variant-${index}`} className="mt-0.5" />
                        <Label htmlFor={`mobile-variant-${index}`} className="font-normal cursor-pointer flex-1" title={systemPromptText}>
                          <span className="text-sm line-clamp-2">
                            {systemPromptText}
                          </span>
                        </Label>
                      </div>
                    )
                  })}
                </RadioGroup>
              </div>
            )}

            {/* Prompt Context (Mobile) */}
            <div className="px-4 py-3 border-b bg-muted/20 flex-shrink-0 max-h-40 overflow-y-auto">
              <p className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">Prompt:</p>
              {promptCitation && (
                <div className="flex items-start space-x-1.5 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-3 py-2 mb-2">
                  <Quote className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>Source: {promptCitation}</span>
                </div>
              )}
              <PromptContextDisplay promptContext={promptContext} />
            </div>

            {/* System Prompt Info (Mobile) */}
            <div className="px-4 py-3 border-b flex-shrink-0">
              {currentVariant?.systemPrompt ? (
                <div className="p-2 rounded-md bg-sky-100/50 dark:bg-sky-900/30 text-xs text-sky-800 dark:text-sky-200 ring-1 ring-sky-200 dark:ring-sky-800">
                  <p className="font-semibold text-sky-900 dark:text-sky-300 mb-1">System Prompt:</p>
                  <p className="whitespace-pre-wrap font-mono text-xs">{currentVariant.systemPrompt}</p>
                </div>
              ) : (
                <div className="p-2 rounded-md bg-slate-100/50 dark:bg-slate-900/30 text-xs text-slate-500 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-800">
                  <p className="italic">[No System Prompt was used for this variant]</p>
                </div>
              )}
            </div>

            {/* Mobile-optimized content */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">
              <EvaluationView 
                assessments={currentVariant.assessments}
                modelResponse={currentVariant.modelResponse}
                idealResponse={idealResponse}
                expandedLogs={expandedLogs}
                toggleLogExpansion={toggleLogExpansion}
                isMobile={true}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Desktop: Use existing responsive layout
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
            
            {promptCitation && (
                <div className="flex items-start space-x-1.5 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-3 py-2">
                    <Quote className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span>Source: {promptCitation}</span>
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
            </div>

            <EvaluationView 
                assessments={currentVariant.assessments}
                modelResponse={currentVariant.modelResponse}
                idealResponse={idealResponse}
                expandedLogs={expandedLogs}
                toggleLogExpansion={toggleLogExpansion}
                isMobile={false}
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