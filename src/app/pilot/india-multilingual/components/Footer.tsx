'use client';

import React from 'react';

export function Footer() {
  return (
    <footer className="py-12 sm:py-16 border-t border-border mt-16 sm:mt-24" role="contentinfo">
      <div className="text-center space-y-3 sm:space-y-4">
        <p className="text-sm sm:text-base text-muted-foreground">
          Data collected by{' '}
          <a
            href="https://www.karya.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Karya
          </a>
          {' · '}
          Analysis by <a
            href="https://cip.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >The Collective Intelligence Project</a>
        </p>

        <p className="text-xs sm:text-sm text-muted-foreground">
          February 2026
        </p>

        <p className="text-xs text-muted-foreground/60 pt-2">
          <a
            href="https://weval.org/api/comparison/karya-anthropic-india-multilingual/india-multilingual-full_e74330710b1e01ee/2026-02-10T15-48-27-773Z/core"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-muted-foreground hover:underline"
          >
            Raw evaluation data
          </a>
          {' '}(16 MB JSON)
        </p>
      </div>
    </footer>
  );
}
