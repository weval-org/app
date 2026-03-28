'use client';

import type { BlueprintSummaryInfo } from '@/app/utils/blueprintSummaryUtils';

function formatDate(isoString: string | null): string | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface EvaluationCardProps {
  blueprint: BlueprintSummaryInfo;
}

export default function EvaluationCard({ blueprint: bp }: EvaluationCardProps) {
  const visibleTags = (bp.tags || []).filter(t => !t.startsWith('_'));
  const modelCount = bp.latestRunModels?.length ?? null;
  const promptCount = bp.latestRunPromptIds?.length ?? null;
  const dateStr = formatDate(bp.latestInstanceTimestamp);

  return (
    <div className="bg-white dark:bg-card border border-[#f2eaea] dark:border-border rounded-[10px] p-6 flex flex-col h-full hover:shadow-md transition-shadow">
      {/* Type label */}
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Evaluation</p>

      {/* Title */}
      <h3 className="text-xl font-bold text-foreground leading-tight mb-3">
        {bp.title || bp.configTitle}
      </h3>

      {/* Description */}
      {bp.description && (
        <p className="text-sm text-foreground/80 dark:text-muted-foreground leading-relaxed mb-4 line-clamp-5">
          {bp.description}
        </p>
      )}

      {/* Tags */}
      {visibleTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {visibleTags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="inline-flex items-center px-3 py-1 rounded-full border border-border text-xs text-foreground/70 capitalize"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Stats row */}
      {(modelCount !== null || promptCount !== null || dateStr) && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground mt-auto pt-2">
          {modelCount !== null && (
            <span><strong className="text-foreground font-semibold">{modelCount}</strong> models</span>
          )}
          {promptCount !== null && (
            <span><strong className="text-foreground font-semibold">{promptCount}</strong> prompts</span>
          )}
          {dateStr && <span className="ml-auto">{dateStr}</span>}
        </div>
      )}
    </div>
  );
}
