import React from 'react';
import CIPLogo from '@/components/icons/CIPLogo';

const headingStyles = {
  fontFamily: '"Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif',
};

const languages = [
  { name: 'Hindi', script: 'हिन्दी' },
  { name: 'Bengali', script: 'বাংলা' },
  { name: 'Telugu', script: 'తెలుగు' },
  { name: 'Kannada', script: 'ಕನ್ನಡ' },
  { name: 'Malayalam', script: 'മലയാളം' },
  { name: 'Assamese', script: 'অসমীয়া' },
  { name: 'Marathi', script: 'मराठी' },
];

export function HeroSection() {
  return (
    <header className="space-y-8 pt-8">
      {/* CIP Attribution */}
      <a
        href="https://cip.org"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <CIPLogo className="w-5 h-5" />
        <span>by The Collective Intelligence Project</span>
      </a>

      {/* Title */}
      <div className="space-y-4">
        <h1
          className="text-4xl md:text-5xl font-bold tracking-tight"
          style={headingStyles}
        >
          India Multilingual Evaluation
        </h1>
        <p className="text-xl text-muted-foreground">
          Comparing Human Evaluators with LLM Judges
        </p>
      </div>

      {/* Language chips */}
      <div className="flex flex-wrap gap-3">
        {languages.map((lang) => (
          <div
            key={lang.name}
            className="px-3 py-1.5 bg-muted/50 dark:bg-slate-800/50 rounded-full text-sm flex items-center gap-2"
          >
            <span className="text-muted-foreground">{lang.name}</span>
            <span className="font-medium">{lang.script}</span>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="h-px bg-border" />
    </header>
  );
}
