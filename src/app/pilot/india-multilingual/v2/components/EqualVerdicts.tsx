'use client';

import React from 'react';

interface EqualVerdictsProps {
  opus: number;
  sonnet: number;
  equalGood: number;
  equalBad: number;
}

export function EqualVerdicts({ opus, sonnet, equalGood, equalBad }: EqualVerdictsProps) {
  const total = opus + sonnet + equalGood + equalBad;

  const segments = [
    { label: 'Opus preferred', value: opus, percent: Math.round(opus / total * 100), color: 'bg-primary' },
    { label: 'Sonnet preferred', value: sonnet, percent: Math.round(sonnet / total * 100), color: 'bg-amber-500' },
    { label: 'Equally good', value: equalGood, percent: Math.round(equalGood / total * 100), color: 'bg-emerald-500' },
    { label: 'Equally bad', value: equalBad, percent: Math.round(equalBad / total * 100), color: 'bg-red-500' },
  ];

  const ariaLabel = segments.map(s => `${s.label}: ${s.percent}%`).join(', ');

  return (
    <section className="py-16 sm:py-24" aria-labelledby="equal-verdicts-title">
      <h2
        id="equal-verdicts-title"
        className="text-2xl sm:text-3xl font-semibold text-foreground mb-4"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        Not Always a Clear Winner
      </h2>

      <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8">
        In {Math.round(equalGood / total * 100)}% of comparisons, native speakers said both responses
        were equally good. Only {(equalBad / total * 100).toFixed(1)}% said both were equally bad.
      </p>

      {/* Stacked bar */}
      <div
        className="h-10 sm:h-12 rounded-lg overflow-hidden flex"
        role="img"
        aria-label={`Distribution of verdicts: ${ariaLabel}`}
      >
        {segments.map((seg, index) => {
          // Ensure minimum width for visibility and border-radius on edges
          const isFirst = index === 0;
          const isLast = index === segments.length - 1;
          const minWidth = (isFirst || isLast) ? Math.max(seg.percent, 2) : seg.percent;

          return (
            <div
              key={seg.label}
              className={`${seg.color} flex items-center justify-center transition-all`}
              style={{
                width: `${minWidth}%`,
                minWidth: seg.value > 0 ? '8px' : '0px'
              }}
            >
              {seg.percent > 8 && (
                <span className="text-xs sm:text-sm font-medium text-white">
                  {seg.percent}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-4 sm:mt-6" role="list" aria-label="Verdict categories">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2" role="listitem">
            <div className={`w-3 h-3 rounded ${seg.color}`} aria-hidden="true" />
            <div>
              <div className="text-sm font-medium">{seg.label}</div>
              <div className="text-xs text-muted-foreground">
                {seg.value.toLocaleString()} ({seg.percent}%)
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Insight */}
      <p className="mt-6 sm:mt-8 text-sm sm:text-base text-muted-foreground">
        This suggests both models are capable — Opus just edges ahead more often when there&apos;s a noticeable difference.
      </p>
    </section>
  );
}
