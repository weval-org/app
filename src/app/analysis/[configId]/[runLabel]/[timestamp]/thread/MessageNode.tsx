'use client';
import React, { useState } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import ReactMarkdown from 'react-markdown';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getHybridScoreColorClass } from '@/app/analysis/utils/colorUtils';
import { Button } from '@/components/ui/button';
import { ChevronLeftIcon, ChevronRightIcon } from '@radix-ui/react-icons';

// Helper for deterministic colors based on provider
const makerColorMap: Record<string, string> = {
    'OPENAI': 'bg-green-100 dark:bg-green-900/50 border-green-300 dark:border-green-700',
    'ANTHROPIC': 'bg-orange-100 dark:bg-orange-900/50 border-orange-300 dark:border-orange-700',
    'GOOGLE': 'bg-blue-100 dark:bg-blue-900/50 border-blue-300 dark:border-blue-700',
    'META': 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-300 dark:border-indigo-700',
    'MISTRAL': 'bg-red-100 dark:bg-red-900/50 border-red-300 dark:border-red-700',
    'XAI': 'bg-gray-200 dark:bg-gray-800/50 border-gray-400 dark:border-gray-600',
    'UNKNOWN': 'bg-gray-100 dark:bg-gray-900/50 border-gray-300 dark:border-gray-700',
};

const MessageNode: React.FC<NodeProps> = ({ data }) => {
    const { role, isContext, baseModelId, responses } = data;
    const [activeIndex, setActiveIndex] = useState(0);

    // Determine the active response and its details
    const activeResponse = Array.isArray(responses) ? responses[activeIndex] : null;
    const text = activeResponse?.text ?? data.text;
    const modelId = activeResponse?.fullModelId ?? data.modelId;
    const coverage = activeResponse?.coverage ?? data.coverage;

    const parsedModel = modelId ? parseModelIdForDisplay(modelId) : (baseModelId ? parseModelIdForDisplay(baseModelId) : null);
    const makerColorClass = parsedModel?.maker ? (makerColorMap[parsedModel.maker] || makerColorMap.UNKNOWN) : makerColorMap.UNKNOWN;

    const isUser = role === 'user';
    const isAssistant = role === 'assistant';

    const baseClasses = "w-[500px] shadow-sm hover:shadow-lg transition-shadow duration-200 ease-in-out";
    const userClasses = "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800";
    const contextClasses = "border-dashed";

    return (
        <Card className={cn(
            baseClasses,
            isUser && userClasses,
            isAssistant && !isContext && makerColorClass,
            isContext && contextClasses
        )}>
            <Handle type="target" position={Position.Left} className="!w-2 !h-2" />
            <CardHeader className="p-2 border-b">
                <CardTitle className="text-xs font-semibold flex justify-between items-center">
                    <span className="capitalize">{role}</span>
                    <div className="flex items-center gap-1.5">
                        {typeof coverage === 'number' && (
                             <Badge className={cn("text-[10px] px-1.5 py-0", getHybridScoreColorClass(coverage / 100))}>
                                {coverage}%
                            </Badge>
                        )}
                        {parsedModel && (
                            <>
                                <Badge variant="outline" className="text-[10px] px-1 py-0">{parsedModel.baseId}</Badge>
                                {parsedModel.temperature !== undefined && <Badge variant="secondary" className="text-[10px] px-1 py-0">T:{parsedModel.temperature}</Badge>}
                            </>
                        )}
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent className="p-2 text-xs overflow-y-auto">
                 <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{text}</ReactMarkdown>
                </div>
            </CardContent>
            {Array.isArray(responses) && responses.length > 1 && (
                <div className="p-1 border-t flex justify-center items-center gap-2">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setActiveIndex(p => (p - 1 + responses.length) % responses.length)}>
                        <ChevronLeftIcon />
                    </Button>
                    <span className="text-[10px] text-muted-foreground font-mono">
                        {activeIndex + 1} / {responses.length}
                    </span>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setActiveIndex(p => (p + 1) % responses.length)}>
                        <ChevronRightIcon />
                    </Button>
                </div>
            )}
            <Handle type="source" position={Position.Right} className="!w-2 !h-2" />
        </Card>
    );
};

export default MessageNode;
