'use client';

import React from 'react';

interface KeyFindingProps {
  number: number;
  title: string;
  stat: string;
  statLabel: string;
  description: string;
}

export function KeyFinding({ number, title, stat, statLabel, description }: KeyFindingProps) {
  return (
    <div>
      <p className="text-xs font-medium text-primary uppercase tracking-widest mb-2">
        Finding {number}
      </p>
      <h2
        className="text-2xl sm:text-3xl font-semibold mb-6"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        {title}
      </h2>
      <div className="flex flex-col sm:flex-row items-start gap-6 sm:gap-10">
        <div className="shrink-0">
          <div
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-primary"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            dangerouslySetInnerHTML={{ __html: stat }}
          />
          <p
            className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-[200px]"
            dangerouslySetInnerHTML={{ __html: statLabel }}
          />
        </div>
        <p
          className="text-base sm:text-lg text-muted-foreground leading-relaxed"
          dangerouslySetInnerHTML={{ __html: description }}
        />
      </div>
    </div>
  );
}
