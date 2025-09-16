'use client';

import React, { useMemo, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';
import ConversationHistory from '@/app/analysis/components/ConversationHistory';
import { ConversationMessage } from '@/types/shared';
import { RenderAsType } from '@/app/components/ResponseRenderer';

interface TemperatureEntry {
    temperature: number;
    history?: ConversationMessage[];
    transcript?: string;
    text?: string;
}

interface TemperatureHistoryGroupProps {
    entries: TemperatureEntry[];
    isMobile?: boolean;
    renderAs?: RenderAsType;
}

/**
 * Groups multiple temperature histories into collapsible sections, with
 * optional bulk expand/collapse controls.
 */
const TemperatureHistoryGroup: React.FC<TemperatureHistoryGroupProps> = ({ entries, isMobile = false, renderAs }) => {
    const [openSet, setOpenSet] = useState<Set<number>>(new Set());

    const allOpen = useMemo(() => entries.length > 0 && openSet.size === entries.length, [entries.length, openSet]);
    const noneOpen = useMemo(() => openSet.size === 0, [openSet]);

    const openAll = () => setOpenSet(new Set(entries.map((_, i) => i)));
    const closeAll = () => setOpenSet(new Set());

    const toggleIndex = (idx: number) => {
        setOpenSet(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    };

    const containerClass = isMobile
        ? 'space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2'
        : 'space-y-6';

    return (
        <div className={containerClass}>
            {entries.length > 1 && (
                <div className="flex items-center justify-end gap-2 text-xs">
                    <Button type="button" variant="ghost" className="h-7 px-2" onClick={allOpen ? closeAll : openAll}>
                        {allOpen ? 'Collapse all' : 'Expand all'}
                    </Button>
                </div>
            )}
            {entries.map((entry, idx) => (
                <Collapsible key={`${entry.temperature}-${idx}`} open={openSet.has(idx)} onOpenChange={() => toggleIndex(idx)}>
                    <CollapsibleTrigger asChild>
                        <button type="button" className="w-full text-left flex items-center justify-between rounded-md border border-border/50 bg-card/50 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-muted-foreground">T {entry.temperature}</span>
                                {entry.history && entry.history.length ? (
                                    <span className="text-[11px] text-muted-foreground">{entry.history.length} turn{entry.history.length === 1 ? '' : 's'}</span>
                                ) : entry.transcript ? (
                                    <span className="text-[11px] text-muted-foreground">Transcript</span>
                                ) : entry.text ? (
                                    <span className="text-[11px] text-muted-foreground">Text</span>
                                ) : (
                                    <span className="text-[11px] text-muted-foreground">Empty</span>
                                )}
                            </div>
                            <Icon name={openSet.has(idx) ? 'chevron-up' : 'chevron-down'} className="h-4 w-4 text-muted-foreground" />
                        </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                        <ConversationHistory
                            history={entry.history}
                            transcript={entry.transcript}
                            text={entry.text}
                            isMobile={isMobile}
                            renderAs={renderAs}
                        />
                    </CollapsibleContent>
                </Collapsible>
            ))}
        </div>
    );
};

export default TemperatureHistoryGroup;


