'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getModelDisplayLabel } from '../../utils/modelIdUtils';

const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const MessageSquare = dynamic(() => import('lucide-react').then(mod => mod.MessageSquare));

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

interface PointAssessment {
    keyPointText: string;
    coverageExtent?: number;
    reflection?: string;
    error?: string;
}

interface ModelEvaluationDetailModalData {
  modelId: string;
  assessments: PointAssessment[]; // Changed from single assessment to array
  promptText: string;
  modelResponse: string;
  systemPrompt: string | null;
}

interface ModelEvaluationDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ModelEvaluationDetailModalData | null;
}

const ModelEvaluationDetailModal: React.FC<ModelEvaluationDetailModalProps> = ({ isOpen, onClose, data }) => {
  if (!data) return null;

  const { modelId, assessments, promptText, modelResponse, systemPrompt } = data;
  const displayModelName = getModelDisplayLabel(modelId);

  const getScoreColor = (score?: number): string => {
    if (score === undefined || score === null || isNaN(score)) return 'bg-slate-500'; // Neutral for undefined
    if (score >= 0.7) return 'bg-green-600';
    if (score >= 0.4) return 'bg-yellow-500';
    return 'bg-red-600';
  };

  // Helper to truncate text
  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="text-2xl font-semibold text-foreground">
            Evaluation Details for: <span className="text-primary">{displayModelName}</span>
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Response to prompt: "{truncateText(promptText, 150)}"
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto p-6 space-y-6 text-sm custom-scrollbar">
          {/* Section 1: Common Information */}
          <div className="space-y-4 p-4 bg-muted/30 dark:bg-slate-800/20 rounded-lg">
            <h3 className="text-lg font-semibold text-foreground mb-3 border-b pb-2">Context</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <p className="font-semibold text-muted-foreground">User Prompt:</p>
                <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/50 dark:bg-slate-800/40 p-3 rounded-md max-h-40 overflow-y-auto custom-scrollbar mt-1">
                  <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{promptText}</ReactMarkdown>
                </div>
              </div>
              {systemPrompt && (
                <div>
                  <p className="font-semibold text-muted-foreground">System Prompt:</p>
                  <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/50 dark:bg-slate-800/40 p-3 rounded-md max-h-40 overflow-y-auto custom-scrollbar mt-1">
                    <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{systemPrompt}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-3">
              <p className="font-semibold text-muted-foreground">Full Model Response:</p>
              <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/50 dark:bg-slate-800/40 p-3.5 rounded-md max-h-60 overflow-y-auto custom-scrollbar mt-1">
                {modelResponse ? (
                  <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{modelResponse}</ReactMarkdown>
                ) : (
                  <p className="italic text-muted-foreground">No response text available.</p>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Criteria Breakdown */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3 pt-2 border-b pb-2">
              Criteria Evaluation
            </h3>
            {assessments && assessments.length > 0 ? (
              <div className="space-y-4">
                {assessments.map((assessment, index) => (
                  <div key={index} className="p-4 rounded-md border border-border dark:border-slate-700/60 bg-card dark:bg-slate-800/30 shadow-sm">
                    <h4 className="font-semibold text-base text-primary mb-2">{assessment.keyPointText}</h4>
                    <div className="space-y-2">
                      {assessment.error && (
                        <Badge variant="destructive" className="text-xs flex items-center space-x-1.5 py-1 px-2.5 w-full justify-start">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          <span>Error: {assessment.error}</span>
                        </Badge>
                      )}
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-muted-foreground">Score:</span>
                        {typeof assessment.coverageExtent === 'number' && !isNaN(assessment.coverageExtent) ? (
                          <Badge className={`text-xs text-white ${getScoreColor(assessment.coverageExtent)}`}>
                            {assessment.coverageExtent.toFixed(2)}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">N/A</Badge>
                        )}
                      </div>
                      <div className="flex items-start space-x-2">
                        <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                        <div>
                          <span className="font-medium text-muted-foreground">Reflection:</span>
                          {assessment.reflection ? (
                              <p className="text-muted-foreground italic pl-1 whitespace-pre-wrap">{assessment.reflection}</p>
                          ) : (
                              <p className="text-muted-foreground italic pl-1">No reflection provided.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground italic">No specific criteria assessments available for this model response.</p>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border bg-muted/30 dark:bg-slate-900/50">
          <Button onClick={onClose} variant="outline">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ModelEvaluationDetailModal; 