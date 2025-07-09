'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getHybridScoreColorClass } from '../utils/colorUtils';

interface SystemPromptsDisplayProps {
    systemPrompts: (string | null)[];
    scores?: Record<number, number | null>;
    title?: string;
    description?: string;
}

export default function SystemPromptsDisplay({
    systemPrompts,
    scores,
    title = "System Prompt Variants",
    description = "This run was executed against the following system prompt variations."
}: SystemPromptsDisplayProps) {
    if (!systemPrompts || systemPrompts.length === 0 || (systemPrompts.length === 1 && systemPrompts[0] === null)) {
        return null;
    }

    return (
        <Card className="shadow-lg border-border dark:border-border">
            <CardHeader>
                <CardTitle className="text-primary text-primary">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="space-y-3">
                    {systemPrompts.map((systemPrompt, index) => {
                        const score = scores?.[index];
                        return (
                            <li key={index} className="flex items-start gap-3 p-2 rounded-md bg-muted/50 dark:bg-muted/30">
                                <div className="flex flex-col items-center gap-1">
                                    <Badge variant="secondary">{`sp_idx:${index}`}</Badge>
                                    {score !== null && score !== undefined && (
                                        <span className={`px-1.5 py-0.5 rounded-sm text-xs font-semibold ${getHybridScoreColorClass(score)}`}>
                                            {(score * 100).toFixed(0)}%
                                        </span>
                                    )}
                                </div>
                                <div className="text-sm text-card-foreground dark:text-card-foreground pt-0.5">
                                    {systemPrompt === null ? (
                                        <em className="text-muted-foreground">[No System Prompt]</em>
                                    ) : (
                                        <p className="whitespace-pre-wrap font-mono">{systemPrompt}</p>
                                    )}
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </CardContent>
        </Card>
    );
} 