'use client';

import React from 'react';
import Link from 'next/link';
import CIPLogo from '@/components/icons/CIPLogo';

interface HeroStatProps {
  percentage: number;
  totalComparisons: number;
  totalRatings: number;
  totalWorkers: number;
}

export function HeroStat({ percentage, totalComparisons, totalRatings, totalWorkers }: HeroStatProps) {
  const languages = [
    { native: 'हिंदी', english: 'Hindi' },
    { native: 'বাংলা', english: 'Bengali' },
    { native: 'తెలుగు', english: 'Telugu' },
    { native: 'ಕನ್ನಡ', english: 'Kannada' },
    { native: 'മലയാളം', english: 'Malayalam' },
    { native: 'অসমীয়া', english: 'Assamese' },
    { native: 'मराठी', english: 'Marathi' },
  ];

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* CIP + weval branding */}
            <div className="flex items-center gap-2 sm:gap-3">
              <a
                href="https://cip.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <CIPLogo className="w-6 h-6 sm:w-7 sm:h-7 text-foreground" />
                <span className="hidden md:inline text-sm font-medium text-foreground">The Collective Intelligence Project</span>
                <span className="md:hidden text-sm font-medium text-foreground">CIP</span>
              </a>
              <span className="text-muted-foreground/40 text-sm">×</span>
              <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
                <span className="text-sm sm:text-base">
                  <span style={{ fontWeight: 700 }}>w</span>
                  <span style={{ fontWeight: 200 }}>eval</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-10 sm:py-16 px-4 sm:px-6" aria-labelledby="hero-title">
        <div className="max-w-4xl mx-auto">
          {/* Title */}
          <div className="text-center mb-8 sm:mb-10">
            <p className="text-sm sm:text-base text-muted-foreground mb-2">India Multilingual Pilot</p>
            <h1
              id="hero-title"
              className="text-2xl sm:text-3xl md:text-4xl font-semibold text-foreground"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              Native speakers preferred Opus 4.5
            </h1>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-10">
            <div className="text-center">
              <div
                className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                {percentage}%
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">preferred Opus</div>
            </div>
            <div className="text-center">
              <div
                className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                {(totalComparisons / 1000).toFixed(1)}k
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">A/B comparisons</div>
            </div>
            <div className="text-center">
              <div
                className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                {totalRatings > 0 ? `${(totalRatings / 1000).toFixed(1)}k` : '—'}
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">rubric ratings</div>
            </div>
            <div className="text-center">
              <div
                className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                {totalWorkers}
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground mt-1">native speakers</div>
            </div>
          </div>

          {/* Language scripts with English labels */}
          <div
            className="flex flex-wrap justify-center gap-3 sm:gap-4"
            role="list"
            aria-label="Languages evaluated"
          >
            {languages.map((lang, i) => (
              <div key={i} className="text-center" role="listitem">
                <div className="text-base sm:text-lg text-muted-foreground/80" lang={lang.english.toLowerCase().slice(0, 2)}>
                  {lang.native}
                </div>
                <div className="text-xs text-muted-foreground/50">{lang.english}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
