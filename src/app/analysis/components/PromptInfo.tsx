'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import PromptContextDisplay from './PromptContextDisplay';
import { ConversationMessage } from '@/types/shared';

const ChevronDown = dynamic(() => import('lucide-react').then(mod => mod.ChevronDown), { ssr: false });
const Quote = dynamic(() => import('lucide-react').then(mod => mod.Quote), { ssr: false });
const MessageSquare = dynamic(() => import('lucide-react').then(mod => mod.MessageSquare), { ssr: false });
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

interface PromptInfoProps {
  description: string | undefined;
  citation: string | undefined;
  promptContext: string | ConversationMessage[] | undefined;
  systemPrompt: string | null;
  variantIndex: number;
}

const PromptInfo: React.FC<PromptInfoProps> = ({ 
  description, 
  citation, 
  promptContext, 
  systemPrompt,
  variantIndex 
}) => {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <Card className="border-border/50">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                Prompt & Context Details
              </CardTitle>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* System Prompt Section */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                System Prompt (Variant {variantIndex})
              </h4>
              {systemPrompt && systemPrompt !== '[No System Prompt]' ? (
                <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/30">
                  <pre className="text-xs text-blue-900 dark:text-blue-100 whitespace-pre-wrap font-mono leading-relaxed">
                    {systemPrompt}
                  </pre>
                </div>
              ) : (
                <div className="p-3 rounded-md bg-muted/50 border border-border/50">
                  <p className="text-xs text-muted-foreground italic">No system prompt was used for this variant</p>
                </div>
              )}
            </div>

            {/* Description Section */}
            {description && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</h4>
                <div className="prose prose-sm dark:prose-invert max-w-none p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
                  <div className="text-xs text-amber-900 dark:text-amber-100">
                    <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                      {description}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
            
            {/* Citation Section */}
            {citation && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Source</h4>
                <div className="flex items-start space-x-2 p-3 rounded-md bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800/30">
                  <Quote className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-slate-600 dark:text-slate-400" />
                  <span className="text-xs text-slate-700 dark:text-slate-300">{citation}</span>
                </div>
              </div>
            )}
            
            {/* Prompt Context Section */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conversation</h4>
              <div className="p-3 rounded-md bg-muted/30 border border-border/50">
                <PromptContextDisplay promptContext={promptContext} />
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default PromptInfo; 