'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import KeyPointCoverageTable from './KeyPointCoverageTable';
import { ComparisonDataV2 as ImportedComparisonDataV2 } from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import PromptContextDisplay from './PromptContextDisplay';

const Quote = dynamic(() => import('lucide-react').then(mod => mod.Quote), { ssr: false });
const User = dynamic(() => import('lucide-react').then(mod => mod.User), { ssr: false });
const Bot = dynamic(() => import('lucide-react').then(mod => mod.Bot), { ssr: false });
const Terminal = dynamic(() => import('lucide-react').then(mod => mod.Terminal), { ssr: false });
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

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

interface PromptDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptId: string | null;
  data: ImportedComparisonDataV2;
  displayedModels: string[];
}

const PromptDetailModal: React.FC<PromptDetailModalProps> = ({ isOpen, onClose, promptId, data, displayedModels }) => {
  if (!isOpen || !promptId) {
    return null;
  }

  const promptContext = data.promptContexts?.[promptId];
  const promptConfig = data.config.prompts.find(p => p.id === promptId);
  
  // Determine the single, effective system prompt
  let effectiveSystemPrompt: string | null = null;
  let conversationContext = promptContext;

  if (Array.isArray(promptContext) && promptContext.length > 0 && promptContext[0].role === 'system') {
    effectiveSystemPrompt = promptContext[0].content;
    conversationContext = promptContext.slice(1); // Remove system message for display
  } else if (promptConfig?.system) {
    effectiveSystemPrompt = promptConfig.system;
  } else if (typeof data.config.system === 'string') {
    // This fallback might be needed if a prompt doesn't have a specific context but was run with a global prompt
    effectiveSystemPrompt = data.config.system;
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-[95vw] h-[95vh] flex flex-col p-0">
        <DialogHeader className="p-4 md:p-6 border-b flex-shrink-0">
          <DialogTitle className="text-xl font-semibold text-foreground">
            Prompt Details
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
            <div className='p-4 md:p-6 border-b flex-shrink-0'>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">The Prompt</h3>
                {promptConfig?.description && (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1 mb-4">
                        <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{promptConfig.description}</ReactMarkdown>
                    </div>
                )}
                
                {promptConfig?.citation && (
                    <div className="flex items-start space-x-1.5 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-3 py-2 mb-4">
                        <Quote className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                        <span>Source: {promptConfig.citation}</span>
                    </div>
                )}
                
                {effectiveSystemPrompt && (
                    <div className="mb-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">System Prompt</h4>
                        <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/40 ring-1 ring-green-200 dark:ring-green-800 text-sm text-green-900 dark:text-green-200 whitespace-pre-wrap">
                            {effectiveSystemPrompt}
                        </div>
                    </div>
                )}
                <PromptContextDisplay promptContext={conversationContext} />
            </div>
            <div className="p-4 md:p-6 flex-1 min-h-0">
                <KeyPointCoverageTable
                    data={data}
                    promptId={promptId}
                    displayedModels={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                    hideHeader={true}
                />
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PromptDetailModal; 