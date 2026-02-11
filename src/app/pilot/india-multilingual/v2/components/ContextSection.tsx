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
        <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
          {/* Left: How it worked */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="font-semibold text-base sm:text-lg">How it worked</h3>
            <ol className="space-y-2 sm:space-y-3 text-sm sm:text-base text-muted-foreground" aria-label="Study methodology steps">
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm flex items-center justify-center font-medium" aria-hidden="true">
                  1
                </span>
                <span>Worker sees a question in their native language</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm flex items-center justify-center font-medium" aria-hidden="true">
                  2
                </span>
                <span>Two AI responses shown side-by-side (anonymous)</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm flex items-center justify-center font-medium" aria-hidden="true">
                  3
                </span>
                <span>Worker picks the better response (or says they&apos;re equal)</span>
              </li>
              <li className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm flex items-center justify-center font-medium" aria-hidden="true">
                  4
                </span>
                <span>Worker records an audio explanation of their choice</span>
              </li>
            </ol>
          </div>

          {/* Right: The domains */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="font-semibold text-base sm:text-lg">What they evaluated</h3>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div className="bg-background rounded-lg p-3 sm:p-4 border border-border">
                <div className="text-xl sm:text-2xl mb-1 sm:mb-2" aria-hidden="true">⚖️</div>
                <div className="font-medium text-sm sm:text-base">Legal</div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  Property rights, labor law, consumer protection
                </div>
              </div>
              <div className="bg-background rounded-lg p-3 sm:p-4 border border-border">
                <div className="text-xl sm:text-2xl mb-1 sm:mb-2" aria-hidden="true">🌾</div>
                <div className="font-medium text-sm sm:text-base">Agriculture</div>
                <div className="text-xs sm:text-sm text-muted-foreground">
                  Crop disease, irrigation, subsidies, livestock
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Key detail */}
      <p className="text-base sm:text-lg text-muted-foreground leading-relaxed italic border-l-4 border-primary/30 pl-4">
        Same question. Same worker. Two anonymous responses.
        <br />
        Which one did they trust?
      </p>
    </section>
  );
}
