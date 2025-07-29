'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { ConversationMessage } from '@/types/shared';
import { cn } from '@/lib/utils';
import Icon from '@/components/ui/icon';
import ReactMarkdown from 'react-markdown';

const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

const getRoleIcon = (role: 'user' | 'assistant' | 'system'): React.ReactNode => {
    switch (role) {
        case 'user':
            return <Icon name="user" className="h-5 w-5 text-sky-800 dark:text-sky-300" />;
        case 'assistant':
            return <Icon name="bot" className="h-5 w-5 text-slate-800 dark:text-slate-300" />;
        case 'system':
            return <Icon name="terminal" className="h-5 w-5 text-gray-800 dark:text-gray-300" />;
        default:
            return null;
    }
};

interface PromptContextDisplayProps {
    promptContext?: string | ConversationMessage[];
}

const PromptContextDisplay: React.FC<PromptContextDisplayProps> = ({ promptContext }) => {
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
        <div className="space-y-4 mt-2 overflow-y-auto custom-scrollbar pr-2">
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

export default PromptContextDisplay; 