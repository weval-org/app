'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import KeyPointCoverageTable from './KeyPointCoverageTable';
import { ComparisonDataV2 as ImportedComparisonDataV2 } from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { ConversationMessage } from '@/types/shared';
import { cn } from '@/lib/utils';

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

const PromptContextDisplay: React.FC<{ promptContext: string | ConversationMessage[] | undefined }> = ({ promptContext }) => {
    if (typeof promptContext === 'string') {
        return (
            <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap p-3 bg-muted/50 rounded-md border">
                <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                    {promptContext}
                </ReactMarkdown>
            </div>
        );
    }
    if (Array.isArray(promptContext) && promptContext.length > 0) {
      return (
        <div className="space-y-4">
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
                    <div className="prose dark:prose-invert max-w-none text-foreground dark:text-slate-200 whitespace-pre-wrap pt-1 font-bold">
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
                <PromptContextDisplay promptContext={promptContext} />
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