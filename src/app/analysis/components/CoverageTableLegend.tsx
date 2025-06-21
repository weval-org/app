'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const Users = dynamic(() => import('lucide-react').then(mod => mod.Users));
const Unlink = dynamic(() => import('lucide-react').then(mod => mod.Unlink));
const Thermometer = dynamic(() => import('lucide-react').then(mod => mod.Thermometer));
const MessageSquare = dynamic(() => import('lucide-react').then(mod => mod.MessageSquare));

export type ActiveHighlight = 'outlier' | 'disagreement' | 'critical_failure' | 'temp_sensitivity' | 'sys_sensitivity';

interface CoverageTableLegendProps {
  activeHighlights: Set<ActiveHighlight>;
  className?: string;
}

const legendConfig: Record<ActiveHighlight, { icon: React.ElementType, text: string, iconClassName: string }> = {
  critical_failure: {
    icon: AlertTriangle,
    text: "Violated a 'should not' constraint",
    iconClassName: "text-red-600 dark:text-red-500",
  },
  temp_sensitivity: {
    icon: Thermometer,
    text: "Sensitive to temperature changes",
    iconClassName: "text-orange-500 dark:text-orange-400",
  },
  sys_sensitivity: {
    icon: MessageSquare,
    text: "Sensitive to system prompt changes",
    iconClassName: "text-indigo-500 dark:text-indigo-400",
  },
  outlier: {
    icon: Unlink,
    text: 'Outlier score (>1.5σ from prompt average)',
    iconClassName: "text-amber-600 dark:text-amber-500",
  },
  disagreement: {
    icon: Users,
    text: 'High judge disagreement on a criterion',
    iconClassName: "text-sky-600 dark:text-sky-500",
  },
};

const CoverageTableLegend: React.FC<CoverageTableLegendProps> = ({ activeHighlights, className }) => {
  const activeItems = Array.from(activeHighlights);
  
  const legendOrder: ActiveHighlight[] = ['critical_failure', 'temp_sensitivity', 'sys_sensitivity', 'outlier', 'disagreement'];
  const sortedActiveItems = legendOrder.filter(item => activeItems.includes(item));


  if (sortedActiveItems.length === 0) {
    return null;
  }

  return (
    <div className={className}>
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
  );
};

export default CoverageTableLegend; 