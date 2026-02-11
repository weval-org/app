'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import type { SampleComparison } from '../V2Client';

interface ComparisonGameProps {
  samples: SampleComparison[];
}

export function ComparisonGame({ samples }: ComparisonGameProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userChoice, setUserChoice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ agreed: 0, total: 0 });
  const [expandedResponse, setExpandedResponse] = useState<'A' | 'B' | null>(null);

  // Filter to only valid samples
  const validSamples = useMemo(() =>
    samples.filter(s => s.workerChoice !== 'unknown' && s.question && s.answer1 && s.answer2),
    [samples]
  );

  const current = validSamples[currentIndex];

  if (!current || validSamples.length === 0) {
    return null; // Don't show section if no comparison data
  }

  const handleChoice = (choice: string) => {
    setUserChoice(choice);
    setRevealed(true);

    const workerChose = current.workerChoice;
    const userAgreed =
      (choice === 'A' && ((workerChose === 'opus' && current.answer1Model.includes('opus')) || (workerChose === 'sonnet' && current.answer1Model.includes('sonnet')))) ||
      (choice === 'B' && ((workerChose === 'opus' && current.answer2Model.includes('opus')) || (workerChose === 'sonnet' && current.answer2Model.includes('sonnet')))) ||
      (choice === 'equal' && (workerChose === 'equal_good' || workerChose === 'equal_bad'));

    setStats(prev => ({
      agreed: prev.agreed + (userAgreed ? 1 : 0),
      total: prev.total + 1,
    }));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % validSamples.length);
    setUserChoice(null);
    setRevealed(false);
    setExpandedResponse(null);
  };

  const workerChoiceLabel = current.workerChoice === 'opus' ? 'Opus' :
    current.workerChoice === 'sonnet' ? 'Sonnet' :
      current.workerChoice === 'equal_good' ? 'Equally Good' : 'Equally Bad';

  const responseAIsOpus = current.answer1Model.includes('opus');

  return (
    <section className="py-16 sm:py-24" aria-labelledby="comparison-title">
      <h2
        id="comparison-title"
        className="text-2xl sm:text-3xl font-semibold text-foreground mb-4"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        See For Yourself
      </h2>

      <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8">
        Here&apos;s an actual comparison a native speaker evaluated.
        Read both responses and pick which you think is better.
      </p>

      {/* Stats */}
      {stats.total > 0 && (
        <div className="mb-6 text-sm text-muted-foreground">
          You&apos;ve agreed with native speakers {stats.agreed}/{stats.total} times
          ({Math.round(stats.agreed / stats.total * 100)}%)
        </div>
      )}

      {/* Question */}
      <div className="bg-muted/30 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {current.language} · {current.domain}
          </span>
        </div>
        <p className="text-lg leading-relaxed">{current.question}</p>
      </div>

      {/* Responses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6" role="group" aria-label="Response options">
        {/* Response A */}
        <div
          className={cn(
            "rounded-xl border-2 transition-all",
            revealed && responseAIsOpus && current.workerChoice === 'opus'
              ? "border-primary bg-primary/5"
              : revealed && !responseAIsOpus && current.workerChoice === 'sonnet'
                ? "border-primary bg-primary/5"
                : "border-border",
            userChoice === 'A' && !revealed && "border-primary/50 bg-primary/5"
          )}
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium">Response A</span>
              {revealed && (
                <span className={cn(
                  "text-xs px-2 py-1 rounded-full",
                  responseAIsOpus ? "bg-primary/20 text-primary" : "bg-amber-500/20 text-amber-600"
                )}>
                  {responseAIsOpus ? 'Opus 4.5' : 'Sonnet 4.5'}
                </span>
              )}
            </div>
            <div className={cn(
              "text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none",
              expandedResponse !== 'A' && "line-clamp-6"
            )}>
              <ResponseRenderer content={current.answer1} renderAs="html" />
            </div>
            {current.answer1.length > 500 && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedResponse(expandedResponse === 'A' ? null : 'A'); }}
                className="text-primary text-sm mt-2 py-2 hover:underline min-h-[44px]"
                aria-expanded={expandedResponse === 'A'}
              >
                {expandedResponse === 'A' ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>

          {!revealed && (
            <button
              onClick={() => handleChoice('A')}
              className="w-full py-4 px-4 border-t border-border hover:bg-muted/50 transition-colors font-medium text-sm min-h-[48px]"
            >
              I prefer Response A
            </button>
          )}
        </div>

        {/* Response B */}
        <div
          className={cn(
            "rounded-xl border-2 transition-all",
            revealed && !responseAIsOpus && current.workerChoice === 'opus'
              ? "border-primary bg-primary/5"
              : revealed && responseAIsOpus && current.workerChoice === 'sonnet'
                ? "border-primary bg-primary/5"
                : "border-border",
            userChoice === 'B' && !revealed && "border-primary/50 bg-primary/5"
          )}
        >
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium">Response B</span>
              {revealed && (
                <span className={cn(
                  "text-xs px-2 py-1 rounded-full",
                  !responseAIsOpus ? "bg-primary/20 text-primary" : "bg-amber-500/20 text-amber-600"
                )}>
                  {!responseAIsOpus ? 'Opus 4.5' : 'Sonnet 4.5'}
                </span>
              )}
            </div>
            <div className={cn(
              "text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none",
              expandedResponse !== 'B' && "line-clamp-6"
            )}>
              <ResponseRenderer content={current.answer2} renderAs="html" />
            </div>
            {current.answer2.length > 500 && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpandedResponse(expandedResponse === 'B' ? null : 'B'); }}
                className="text-primary text-sm mt-2 py-2 hover:underline min-h-[44px]"
                aria-expanded={expandedResponse === 'B'}
              >
                {expandedResponse === 'B' ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>

          {!revealed && (
            <button
              onClick={() => handleChoice('B')}
              className="w-full py-4 px-4 border-t border-border hover:bg-muted/50 transition-colors font-medium text-sm min-h-[48px]"
            >
              I prefer Response B
            </button>
          )}
        </div>
      </div>

      {/* Equal options */}
      {!revealed && (
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => handleChoice('equal')}
            className="px-6 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded-lg min-h-[44px]"
          >
            They&apos;re equally good
          </button>
        </div>
      )}

      {/* Result */}
      {revealed && (
        <div className="bg-muted/30 rounded-xl p-6 text-center space-y-4">
          <div className="text-base sm:text-lg">
            The native speaker chose:{' '}
            <span className="font-semibold text-primary">{workerChoiceLabel}</span>
          </div>

          <button
            onClick={handleNext}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors min-h-[44px]"
          >
            Try another comparison
          </button>
        </div>
      )}
    </section>
  );
}
