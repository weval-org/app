'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getModelDisplayLabel } from '../../utils/modelIdUtils';

const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const CheckCircle = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle));
const Info = dynamic(() => import('lucide-react').then(mod => mod.Info));
const MessageSquare = dynamic(() => import('lucide-react').then(mod => mod.MessageSquare));
const XCircle = dynamic(() => import('lucide-react').then(mod => mod.XCircle));

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

interface PointAssessment {
    keyPointText: string;
    coverageExtent?: number;
    reflection?: string;
    error?: string;
}

interface CriterionDetailModalData {
  modelId: string;
  assessment: PointAssessment;
  promptText: string;
  modelResponse: string;
  systemPrompt: string | null;
}

interface CriterionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: CriterionDetailModalData | null;
}

const CriterionDetailModal: React.FC<CriterionDetailModalProps> = ({ isOpen, onClose, data }) => {
  if (!data) return null;

  const { modelId, assessment, promptText, modelResponse, systemPrompt } = data;
  const displayModelName = getModelDisplayLabel(modelId);

  const getScoreColor = (score?: number): string => {
    if (score === undefined || score === null || isNaN(score)) return 'bg-slate-500'; // Neutral for undefined
    if (score >= 0.7) return 'bg-green-600';
    if (score >= 0.4) return 'bg-yellow-500';
    return 'bg-red-600';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b border-border">
          <DialogTitle className="text-2xl font-semibold text-foreground">Criterion Evaluation Detail</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Detailed breakdown for: <span className="font-medium text-primary">{assessment.keyPointText}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-grow overflow-y-auto p-6 space-y-6 text-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Model & Prompt</h3>
              <div className="space-y-2 text-muted-foreground">
                <p><strong>Model:</strong> <span className="text-foreground">{displayModelName}</span></p>
                <p><strong>Prompt:</strong></p>
                <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/50 dark:bg-slate-800/40 p-3 rounded-md max-h-32 overflow-y-auto custom-scrollbar">
                  <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{promptText}</ReactMarkdown>
                </div>
                {systemPrompt && (
                  <>
                    <p className="mt-2"><strong>System Prompt:</strong></p>
                    <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/50 dark:bg-slate-800/40 p-3 rounded-md max-h-32 overflow-y-auto custom-scrollbar">
                      <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{systemPrompt}</ReactMarkdown>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Evaluation Result</h3>
              <div className="space-y-3">
                {assessment.error && (
                  <Badge variant="destructive" className="text-xs flex items-center space-x-1.5 py-1 px-2.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Error: {assessment.error}</span>
                  </Badge>
                )}
                <div className="flex items-center space-x-2">
                  <span className="font-semibold">Score:</span>
                  {typeof assessment.coverageExtent === 'number' && !isNaN(assessment.coverageExtent) ? (
                    <Badge className={`text-xs text-white ${getScoreColor(assessment.coverageExtent)}`}>
                      {assessment.coverageExtent.toFixed(2)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">N/A</Badge>
                  )}
                </div>
                <div className="flex items-start space-x-2">
                  <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <span className="font-semibold">Reflection:</span>
                    {assessment.reflection ? (
                        <p className="text-muted-foreground italic pl-1">{assessment.reflection}</p>
                    ) : (
                        <p className="text-muted-foreground italic pl-1">No reflection provided.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Model Response</h3>
            <div className="prose prose-sm dark:prose-invert max-w-none bg-muted/50 dark:bg-slate-800/40 p-4 rounded-md max-h-60 overflow-y-auto custom-scrollbar">
              {modelResponse ? (
                <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{modelResponse}</ReactMarkdown>
              ) : (
                <p className="italic text-muted-foreground">No response text available.</p>
              )}
            </div>
          </div>

        </div>

        <DialogFooter className="p-4 border-t border-border bg-muted/30">
          <Button onClick={onClose} variant="outline">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CriterionDetailModal; 