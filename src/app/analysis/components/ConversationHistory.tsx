'use client';

import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';
import { cn } from '@/lib/utils';
import { ConversationMessage } from '@/types/shared';
import { Button } from '@/components/ui/button';

// Minimum number of hidden messages required to use collapse mode.
// If collapsing would hide fewer than or equal to this count, show the full history.
const MIN_HIDDEN_TO_COLLAPSE = 3;

interface ConversationHistoryProps {
    history?: ConversationMessage[];
    transcript?: string;
    text?: string;
    isMobile?: boolean;
    initiallyCollapsed?: boolean;
    headCount?: number;
    tailCount?: number;
}

/**
 * Renders a conversation history with an ellipsis-style middle collapse.
 * - When collapsed, shows the first N and last M messages with a toggle to reveal the middle.
 * - Falls back to transcript or plain text when history is not provided.
 */
const ConversationHistory: React.FC<ConversationHistoryProps> = ({
    history,
    transcript,
    text,
    isMobile = false,
    initiallyCollapsed = true,
    headCount = 1,
    tailCount = 1,
}) => {
    const [collapsed, setCollapsed] = useState(initiallyCollapsed);

    const content = useMemo(() => {
        if (history && history.length > 0) {
            // Determine which messages to show when collapsed:
            // - Head: first `headCount` messages (as before)
            // - Tail: the last `tailCount` user messages BEFORE the final assistant response
            //   (defaults to just the last user message)
            const headEnd = Math.min(headCount, history.length);

            // Find index of the final assistant message (if any)
            let lastAssistantIdx = -1;
            for (let i = history.length - 1; i >= 0; i -= 1) {
                if (history[i].role === 'assistant') {
                    lastAssistantIdx = i;
                    break;
                }
            }

            const boundary = lastAssistantIdx === -1 ? history.length : lastAssistantIdx; // messages strictly before assistant response

            // Collect user message indices before the boundary
            const userBeforeAssistant: number[] = [];
            for (let i = 0; i < boundary; i += 1) {
                if (history[i].role === 'user') userBeforeAssistant.push(i);
            }

            // Choose the last `tailCount` user indices (defaults to 1)
            const tailCountToUse = Math.max(1, tailCount || 1);
            let tailIndices: number[];
            if (userBeforeAssistant.length > 0) {
                tailIndices = userBeforeAssistant.slice(-tailCountToUse);
            } else {
                // Fallback to the very last message before assistant (or overall last if no assistant)
                const fallbackIdx = Math.max(0, boundary - 1);
                tailIndices = [fallbackIdx];
            }

            // Always include the final assistant response (if present) in the visible tail
            if (lastAssistantIdx !== -1) {
                tailIndices.push(lastAssistantIdx);
            }

            // Deduplicate and avoid including anything already shown in the head slice
            tailIndices = Array.from(new Set(tailIndices)).filter(idx => idx >= headEnd);
            // Ensure chronological order for rendering
            tailIndices.sort((a, b) => a - b);

            const head = history.slice(0, headEnd);
            const tail = tailIndices.map(idx => history[idx]);

            const shownCount = head.length + tail.length;
            const hiddenCount = Math.max(history.length - shownCount, 0);

            if (!collapsed || hiddenCount <= MIN_HIDDEN_TO_COLLAPSE) {
                return { mode: 'full', head: history, middle: [], tail: [] as ConversationMessage[], hiddenCount } as const;
            }

            // Middle is everything not in head or the selected tail indices; we don't render it in
            // collapsed mode but we keep it for completeness and potential future use
            const firstTailIdx = tailIndices.length > 0 ? tailIndices[0] : history.length;
            const middle = history.slice(headEnd, firstTailIdx);

            return { mode: 'collapsed', head, middle, tail, hiddenCount } as const;
        }
        return { mode: 'fallback', head: [], middle: [], tail: [], hiddenCount: 0 } as const;
    }, [history, collapsed, headCount, tailCount]);

    if (!history || history.length === 0) {
        if (transcript) {
            return (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{transcript}</ReactMarkdown>
                </div>
            );
        }
        if (text) {
            return (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{text}</ReactMarkdown>
                </div>
            );
        }
        return <p className="italic text-muted-foreground">No intermediary turns available.</p>;
    }

    const renderMessage = (msg: ConversationMessage, idx: number) => (
        <div key={idx} className={cn(
            'rounded-md p-3 border',
            msg.role === 'user' ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800/40' :
            msg.role === 'assistant' ? 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700/40' :
            'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-700/40'
        )}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{msg.role}</p>
            {msg.content === null ? (
                <p className="italic text-muted-foreground">[assistant: null — to be generated]</p>
            ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>{msg.content}</ReactMarkdown>
                </div>
            )}
        </div>
    );

    const containerClasses = cn(
        isMobile
            ? 'space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2'
            : 'space-y-3'
    );

    return (
        <div className={containerClasses}>
            {content.mode !== 'fallback' && content.head.map(renderMessage)}
            {content.mode === 'collapsed' && content.hiddenCount > 0 && (
                <div className="flex items-center justify-center">
                    <div className="w-full text-center border-y border-dashed border-border/60 py-2 my-1 text-xs text-muted-foreground">
                        <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setCollapsed(false)}>
                            Show {content.hiddenCount} hidden message{content.hiddenCount === 1 ? '' : 's'}
                        </Button>
                    </div>
                </div>
            )}
            {content.mode === 'full' && content.hiddenCount > 0 && (
                <div className="flex items-center justify-center">
                    <div className="w-full text-center border-y border-dashed border-border/60 py-2 my-1 text-xs text-muted-foreground">
                        <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setCollapsed(true)}>
                            Hide middle messages
                        </Button>
                    </div>
                </div>
            )}
            {content.mode === 'full' && content.tail.length === 0 && content.hiddenCount === 0 && null}
            {content.mode !== 'fallback' && (collapsed ? content.tail : content.tail).map(renderMessage)}
            {!collapsed && content.mode === 'collapsed' && content.middle.map(renderMessage)}
        </div>
    );
};

export default ConversationHistory;


