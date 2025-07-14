'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import KeyPointCoverageTable from '@/app/analysis/components/KeyPointCoverageTable';
import PromptContextDisplay from '@/app/analysis/components/PromptContextDisplay';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { parseEffectiveModelId } from '@/app/utils/modelIdUtils';

const Quote = dynamic(() => import('lucide-react').then(mod => mod.Quote), { ssr: false });
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

const PromptDetailModal: React.FC = () => {
    const {
        data,
        promptDetailModal,
        closePromptDetailModal,
        displayedModels,
        configId
    } = useAnalysis();
    
    const { isOpen, promptId } = promptDetailModal;

    const promptContext = useMemo(() => {
        if (!data || !promptId) return null;
        return data.promptContexts?.[promptId];
    }, [data, promptId]);

    const { effectiveSystemPrompt, conversationContext } = useMemo(() => {
        if (!promptId || !data) return { effectiveSystemPrompt: null, conversationContext: null };

        const context = data.promptContexts?.[promptId];
        let conversationContextValue = context;
        let effectiveSystemPromptValue: string | null = null;
        
        if (Array.isArray(context) && context.length > 0 && context[0].role === 'system') {
            effectiveSystemPromptValue = context[0].content;
            conversationContextValue = context.slice(1);
        } else {
            const promptConfig = data.config.prompts.find(p => p.id === promptId);
            if (promptConfig?.system) {
                effectiveSystemPromptValue = promptConfig.system;
            } else if (data.config.system) {
                effectiveSystemPromptValue = data.config.system;
            } else if (Array.isArray(data.config.systems) && data.config.systems.length > 0) {
                effectiveSystemPromptValue = data.config.systems[0];
            }
        }
        
        return { effectiveSystemPrompt: effectiveSystemPromptValue, conversationContext: conversationContextValue };
    }, [promptId, data]);

    if (!isOpen || !promptId || !data) {
        return null;
    }
    
    const promptConfig = data.config.prompts.find(p => p.id === promptId);
    const hasSystemVariants = Array.isArray(data.config.systems) && data.config.systems.length > 1;

    return (
        <Dialog open={isOpen} onOpenChange={closePromptDetailModal}>
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
                                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                    {hasSystemVariants ? 'Base System Prompt' : 'System Prompt'}
                                </h4>
                                <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/40 ring-1 ring-green-200 dark:ring-green-800 text-sm text-green-900 dark:text-green-200 whitespace-pre-wrap">
                                    {effectiveSystemPrompt}
                                </div>
                            </div>
                        )}
                        <PromptContextDisplay promptContext={conversationContext || undefined} />
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