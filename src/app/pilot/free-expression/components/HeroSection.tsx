'use client';

import React from 'react';
import CIPLogo from '@/components/icons/CIPLogo';
import { AnthropicLogo } from '../../india-multilingual/components/AnthropicLogo';
import { ExternalLink } from 'lucide-react';

export function HeroSection() {
  return (
    <>
      {/* Nav bar */}
      <header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-12 sm:h-14">
            <a
              href="https://cip.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:opacity-80 transition-opacity text-xs sm:text-sm text-muted-foreground"
            >
              <CIPLogo className="w-5 h-5 text-foreground" />
              <span className="hidden sm:inline font-medium text-foreground">CIP</span>
            </a>
            <nav className="flex items-center gap-3 sm:gap-4">
              <a
                href="/about"
                className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                About
              </a>
              <a
                href="https://cip.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                cip.org
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://weval.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>
                  <span style={{ fontWeight: 700 }}>w</span>
                  <span style={{ fontWeight: 200 }}>eval</span>
                </span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-10 sm:py-16 px-4 sm:px-6" aria-labelledby="hero-title">
        <div className="max-w-4xl mx-auto">
          {/* CIP brand */}
          <div className="text-center mb-4 sm:mb-5">
            <a
              href="https://cip.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-col items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <CIPLogo className="w-12 h-12 sm:w-14 sm:h-14 text-foreground" />
              <span className="text-sm sm:text-base font-medium text-foreground">
                The Collective Intelligence Project
              </span>
            </a>
          </div>

          {/* Partnership */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-10 sm:mb-14">
            <span className="text-xs sm:text-sm text-muted-foreground">Commissioned by</span>
            <a
              href="https://anthropic.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity"
            >
              <AnthropicLogo className="h-3 sm:h-3.5 w-auto text-foreground" />
            </a>
          </div>

          {/* Title */}
          <div className="text-center mb-6 sm:mb-8">
            <h1
              id="hero-title"
              className="text-3xl sm:text-4xl md:text-5xl font-semibold text-foreground mb-3"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Free Expression &amp; AI
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
              A democratic evaluation of how AI should handle free expression, grounded in
              Article 19 of the Universal Declaration of Human Rights
            </p>
          </div>

          {/* Weval explainer */}
          <div className="text-center mb-10 sm:mb-14 space-y-2">
            <p className="text-xs sm:text-sm text-muted-foreground">conducted using</p>
            <a
              href="https://weval.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block hover:opacity-80 transition-opacity"
            >
              <span className="text-xl sm:text-2xl text-foreground">
                <span style={{ fontWeight: 700 }}>w</span>
                <span style={{ fontWeight: 200 }}>eval</span>
              </span>
            </a>
            <p className="text-xs sm:text-sm text-muted-foreground">
              CIP&apos;s platform for running contextual evaluations of AI systems
            </p>
          </div>

          {/* Key finding */}
          <div className="text-center mb-8 sm:mb-10">
            <p
              className="text-xl sm:text-2xl md:text-3xl font-semibold text-primary"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              44 principles the world agrees on
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-10">
            <div className="text-center">
              <div
                className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                44
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                validated principles
              </div>
            </div>
            <div className="text-center">
              <div
                className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                2.2k
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">participants</div>
            </div>
            <div className="text-center">
              <div
                className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                3
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">countries</div>
            </div>
            <div className="text-center">
              <div
                className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                7
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">AI models tested</div>
            </div>
          </div>

          {/* Countries */}
          <div
            className="flex flex-wrap justify-center gap-6 sm:gap-8"
            role="list"
            aria-label="Countries represented"
          >
            {[
              { flag: 'US', name: 'United States' },
              { flag: 'GB', name: 'United Kingdom' },
              { flag: 'IN', name: 'India' },
            ].map((c) => (
              <div key={c.flag} className="text-center" role="listitem">
                <div className="text-2xl sm:text-3xl mb-1">
                  {c.flag === 'US' ? '🇺🇸' : c.flag === 'GB' ? '🇬🇧' : '🇮🇳'}
                </div>
                <div className="text-xs text-muted-foreground">{c.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
