'use client';

import React from 'react';

export function Footer() {
  return (
    <footer
      className="py-12 sm:py-16 border-t border-border mt-16 sm:mt-24"
      role="contentinfo"
    >
      <div className="text-center space-y-3 sm:space-y-4">
        <p className="text-sm sm:text-base text-muted-foreground">
          Research by{' '}
          <a
            href="https://cip.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            The Collective Intelligence Project
          </a>
          {' · '}
          Commissioned by{' '}
          <a
            href="https://anthropic.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Anthropic
          </a>
        </p>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Grounded in Article 19 of the Universal Declaration of Human Rights
        </p>
        <p className="text-xs text-muted-foreground/60 pt-2">
          2,200+ participants across the United States, United Kingdom, and India · 2025–2026
        </p>
      </div>
    </footer>
  );
}
