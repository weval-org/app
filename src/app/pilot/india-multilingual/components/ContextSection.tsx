'use client';

import React from 'react';

export function ContextSection() {
  return (
    <section className="py-16 sm:py-24 space-y-6 sm:space-y-8" aria-labelledby="context-title">
      <h2
        id="context-title"
        className="text-2xl sm:text-3xl font-semibold text-foreground"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        The Experiment
      </h2>

      <div className="prose prose-base sm:prose-lg prose-slate dark:prose-invert max-w-none">
        <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed">
          AI models are benchmarked on English. But what about the languages spoken by
          over a billion people?
        </p>

        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          We partnered with{' '}
          <a
            href="https://www.karya.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Karya
          </a>{' '}
          to ask native speakers across India to compare Claude Opus 4.5 and Sonnet 4.5
          on questions that matter to them: tenant rights, crop disease, labor law,
          irrigation subsidies.
        </p>
      </div>

      {/* The setup */}
      <div className="bg-muted/30 rounded-xl sm:rounded-2xl p-4 sm:p-8 mt-6 sm:mt-8">
        <h3 className="font-semibold text-base sm:text-lg mb-4">Two evaluation methods</h3>

        <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
          {/* Left: A/B Comparisons */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-primary font-medium">Task 1</span>
              <span className="text-sm font-medium">Head-to-Head Comparison</span>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground" aria-label="A/B comparison task">
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">1</span>
                <span>Worker sees a question + two AI responses (anonymous)</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">2</span>
                <span>Picks the better response (or says equal)</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">3</span>
                <span>Records audio explanation of their choice</span>
              </li>
            </ol>
          </div>

          {/* Right: Rubric Ratings */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-amber-600 font-medium">Task 2</span>
              <span className="text-sm font-medium">Rubric-Based Rating</span>
            </div>
            <ol className="space-y-2 text-sm text-muted-foreground" aria-label="Rubric rating task">
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/10 text-amber-600 text-xs flex items-center justify-center font-medium">1</span>
                <span>Worker sees a question + one AI response</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/10 text-amber-600 text-xs flex items-center justify-center font-medium">2</span>
                <span>Rates it on 4 criteria: trust, fluency, complexity, code-switching</span>
              </li>
              <li className="flex gap-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-500/10 text-amber-600 text-xs flex items-center justify-center font-medium">3</span>
                <span>Each criterion scored independently</span>
              </li>
            </ol>
          </div>
        </div>

        {/* Domains */}
        <div className="mt-6 pt-6 border-t border-border/50">
          <h4 className="text-sm font-medium mb-3">Domains covered</h4>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-lg border border-border text-sm">
              <span aria-hidden="true">⚖️</span> Legal (property, labor, consumer)
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-lg border border-border text-sm">
              <span aria-hidden="true">🌾</span> Agriculture (crops, subsidies, livestock)
            </span>
          </div>
        </div>
      </div>

      {/* Key insight */}
      <p className="text-base sm:text-lg text-muted-foreground leading-relaxed italic border-l-4 border-primary/30 pl-4">
        Two tasks, one paradox: Workers preferred Opus in direct comparisons, but rated
        Sonnet slightly higher on individual criteria.
      </p>
    </section>
  );
}
