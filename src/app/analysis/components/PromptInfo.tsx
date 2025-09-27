'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Icon from '@/components/ui/icon';
// import { usePreloadIcons } from '@/components/ui/use-preload-icons';
import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';

// const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
// const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

interface PromptInfoProps {
  description: string | undefined;
  citation: any;
}

const PromptInfo: React.FC<PromptInfoProps> = ({ 
  description, 
  citation
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  // usePreloadIcons(['message-square', 'chevron-down']);

  return (
    <Card className="border-border/50">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Icon name="message-square" className="h-4 w-4 text-muted-foreground" />
                Prompt Details
              </CardTitle>
              <Icon name="chevron-down" className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">

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
                  <Icon name="quote" className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-slate-600 dark:text-slate-400" />
                  {(() => {
                    const c: any = citation;
                    if (typeof c === 'string') return (<span className="text-xs text-slate-700 dark:text-slate-300">{c}</span>);
                    if (c && typeof c === 'object') {
                      const title = c.title || c.name || '';
                      const url = c.url as string | undefined;
                      const content = <span className="text-xs text-slate-700 dark:text-slate-300">{title}</span>;
                      return url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{content}</a>
                      ) : content;
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}

            {/* System Prompt intentionally omitted */}
            
            {/* Conversation thread is intentionally omitted here; it's shown alongside the model output. */}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default PromptInfo; 