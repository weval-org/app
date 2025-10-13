'use client';

import { generateTextualBar, getScoreColorClass } from '../utils/textualUtils';
import { cn } from '@/lib/utils';

interface TextualBarProps {
  score: number | null;
  length?: number;
  showPercentage?: boolean;
  className?: string;
}

/**
 * Renders a textual progress bar using Unicode block characters
 */
export function TextualBar({ score, length = 20, showPercentage = false, className }: TextualBarProps) {
  const bar = generateTextualBar(score, length);
  const colorClass = getScoreColorClass(score);

  return (
    <span className={cn('font-mono text-sm', className)}>
      <span className={colorClass}>{bar}</span>
      {showPercentage && score !== null && (
        <span className={cn('ml-2 text-xs', colorClass)}>
          {(score * 100).toFixed(1)}%
        </span>
      )}
    </span>
  );
}
