'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import Icon from '@/components/ui/icon';

export type ActiveHighlight = 'outlier' | 'disagreement' | 'critical_failure' | 'temp_sensitivity' | 'sys_sensitivity';

interface CoverageTableLegendProps {
  activeHighlights: Set<ActiveHighlight>;
  className?: string;
  simplifiedView?: boolean;
}

const legendConfig: Record<ActiveHighlight, { icon: React.ElementType, text: string, iconClassName: string }> = {
  critical_failure: {
    icon: () => <Icon name="alert-triangle" />,
    text: "Violated a 'should not' constraint",
    iconClassName: "text-red-600 dark:text-red-500",
  },
  temp_sensitivity: {
    icon: () => <Icon name="thermometer" />,
    text: "Sensitive to temperature changes",
    iconClassName: "text-orange-500 dark:text-orange-400",
  },
  sys_sensitivity: {
    icon: () => <Icon name="message-square" />,
    text: "Sensitive to system prompt changes",
    iconClassName: "text-indigo-500 dark:text-indigo-400",
  },
  outlier: {
    icon: () => <Icon name="unlink" />,
    text: 'Outlier score (>1.5σ from prompt average)',
    iconClassName: "text-amber-600 dark:text-amber-500",
  },
  disagreement: {
    icon: () => <Icon name="users" />,
    text: 'High judge disagreement on a criterion',
    iconClassName: "text-sky-600 dark:text-sky-500",
  },
};

const CoverageTableLegend: React.FC<CoverageTableLegendProps> = ({ activeHighlights, className, simplifiedView = false }) => {
  const activeItems = Array.from(activeHighlights);
  
  const legendOrder: ActiveHighlight[] = ['critical_failure', 'temp_sensitivity', 'sys_sensitivity', 'outlier', 'disagreement'];
  const sortedActiveItems = legendOrder.filter(item => activeItems.includes(item));

  return (
    <div className={cn("space-y-4", className)}>
        {/* Color Scale Section */}
        <div>
            <div className="text-sm font-medium text-foreground mb-2">
                Color Scale - {simplifiedView ? 'Simplified View (Avg. Coverage)' : 'Detailed View (Individual Criteria)'}
            </div>
            <div className="flex items-center flex-wrap gap-x-4 gap-y-2 text-xs">
                <div className="flex items-center gap-1" title="Criterion is fully met (100%)">
                    <div className="w-3.5 h-3.5 bg-coverage-fully-met rounded-sm border border-border/50"></div>
                    <span>Perfect</span>
                </div>
                <div className="flex items-center gap-1" title="Extent: 90-99%">
                    <div className="w-3.5 h-3.5 bg-coverage-grade-9 rounded-sm border border-border/50"></div>
                    <span>Excellent</span>
                </div>
                <div className="flex items-center gap-1" title="Extent: 70-89%">
                    <div className="w-3.5 h-3.5 bg-coverage-grade-7 rounded-sm border border-border/50"></div>
                    <span>Good</span>
                </div>
                <div className="flex items-center gap-1" title="Extent: 50-69%">
                    <div className="w-3.5 h-3.5 bg-coverage-grade-5 rounded-sm border border-border/50"></div>
                    <span>Fair</span>
                </div>
                <div className="flex items-center gap-1" title="Extent: 30-49%">
                    <div className="w-3.5 h-3.5 bg-coverage-grade-3 rounded-sm border border-border/50"></div>
                    <span>Poor</span>
                </div>
                <div className="flex items-center gap-1" title="Extent: 10-29%">
                    <div className="w-3.5 h-3.5 bg-coverage-grade-1 rounded-sm border border-border/50"></div>
                    <span>Bad</span>
                </div>
                <div className="flex items-center gap-1" title="Criterion is not met (&lt;10%)">
                    <div className="w-3.5 h-3.5 bg-coverage-unmet rounded-sm border border-border/50"></div>
                    <span>Not Met</span>
                </div>
            </div>
        </div>



        {/* Highlight Key Section (conditional) */}
        {!simplifiedView && sortedActiveItems.length > 0 && (
            <div>
                <h4 className="text-xs font-semibold text-muted-foreground tracking-wider uppercase mb-2">Highlight Key</h4>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {sortedActiveItems.map(key => {
                    const config = legendConfig[key as ActiveHighlight];
                    if (!config) return null;
                    const Icon = config.icon;
                    return (
                        <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground dark:text-slate-400">
                        <Icon className={`w-3.5 h-3.5 ${config.iconClassName}`} />
                        <span>{config.text}</span>
                        </div>
                    );
                    })}
                </div>
            </div>
        )}
    </div>
  );
};

export default CoverageTableLegend; 