'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getModelDisplayLabel } from '../../utils/modelIdUtils';
import { ConversationMessage } from '../../../app/utils/types';

const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const MessageSquare = dynamic(() => import('lucide-react').then(mod => mod.MessageSquare));
const ChevronDown = dynamic(() => import('lucide-react').then(mod => mod.ChevronDown));
const ChevronUp = dynamic(() => import('lucide-react').then(mod => mod.ChevronUp));
const Quote = dynamic(() => import('lucide-react').then(mod => mod.Quote));

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

interface PointAssessment {
    keyPointText: string;
    coverageExtent?: number;
    reflection?: string;
    error?: string;
    multiplier?: number;
    citation?: string;
}

interface ModelEvaluationDetailModalData {
  modelId: string;
  assessments: PointAssessment[];
  promptContext: string | ConversationMessage[];
  modelResponse: string;
  systemPrompt: string | null;
}

interface ModelEvaluationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ModelEvaluationDetailModalData | null;
}

const ModelEvaluationDetailModalV2: React.FC<ModelEvaluationDetailModalProps> = ({ isOpen, onClose, data }) => {
  if (!data) return null;

  const { modelId, assessments, promptContext, modelResponse, systemPrompt } = data;
  const displayModelName = getModelDisplayLabel(modelId);

  const getScoreColor = (score?: number): string => {
    if (score === undefined || score === null || isNaN(score)) return 'bg-slate-500'; // Neutral for undefined
    if (score >= 0.7) return 'bg-green-600';
    if (score >= 0.4) return 'bg-yellow-500';
    return 'bg-red-600';
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const renderPromptContext = () => {
    if (typeof promptContext === 'string') {
      return <div className="whitespace-pre-wrap">{promptContext}</div>;
    }
    if (Array.isArray(promptContext) && promptContext.length > 0) {
      return (
        <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar pr-1">
          {promptContext.map((msg, index) => (
            <div key={index} className={`p-1.5 rounded-md text-xs ${msg.role === 'user' ? 'bg-sky-100 dark:bg-sky-900/30' : msg.role === 'assistant' ? 'bg-slate-100 dark:bg-slate-800/30' : 'bg-gray-100 dark:bg-gray-700/30'}`}>
              <p className="text-[10px] font-semibold text-muted-foreground dark:text-slate-400 capitalize">{msg.role}</p>
              <p className="text-xs text-card-foreground dark:text-slate-200 whitespace-pre-wrap">{msg.content}</p>
            </div>
          ))}
        </div>
      );
    }
    return <p className="italic">Prompt context not available.</p>;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden"> {/* overflow-hidden is key for child flex layout */}
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="text-xl font-semibold text-foreground">
            Evaluation Details for: <span className="text-primary">{displayModelName}</span>
          </DialogTitle>
          <div className="text-sm text-muted-foreground max-h-24 overflow-y-auto custom-scrollbar pr-2">
            <p className="font-semibold">PROMPT:</p>
            {renderPromptContext()}
          </div>
        </DialogHeader>

        {/* Main Content Area: Two Columns - MODIFIED */}
        <div className="flex-1 px-3 text-sm flex flex-col lg:flex-row lg:space-x-3 overflow-hidden min-h-0"> 
          
          {/* Left Column: Model Output ONLY */}
          <div className="lg:w-1/2 flex flex-col overflow-hidden">
            {/* Full Height: Model Response */}
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

          {/* Right Column: Criteria Breakdown - REMOVED h-full */}
          <div className="lg:w-1/2 flex flex-col mt-6 lg:mt-0 overflow-hidden">
            {/* flex-1 min-h-0 on the content wrapper */}
            <div className="flex-1 min-h-0 flex flex-col p-3 bg-muted/10 dark:bg-slate-800/20 rounded-lg overflow-hidden border border-border/50">
              <h3 className="font-semibold text-muted-foreground text-sm mb-1.5 pb-1 border-b border-border/30 sticky top-0 bg-card z-10">
                Criteria Evaluation ({assessments.length})
              </h3>
              <div className="flex-grow overflow-y-auto custom-scrollbar space-y-3 pr-1 pt-1">
                {assessments && assessments.length > 0 ? (
                  assessments.map((assessment, index) => (
                    <div key={index} className="p-3 rounded-md border border-border/70 dark:border-slate-700/60 bg-card/50 dark:bg-slate-800/50 shadow-sm">
                      <h4 className="font-semibold text-sm text-primary mb-1.5">{assessment.keyPointText}</h4>
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
                            <Badge className={`text-xs text-white ${getScoreColor(assessment.coverageExtent)}`}>
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
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground italic text-sm">No specific criteria assessments available for this model response.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border bg-muted/30 dark:bg-slate-900/50">
          <Button onClick={onClose} variant="outline">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModelEvaluationDetailModalV2; 