'use client';

import React from 'react';

export interface FilterState {
  language: string;
  domain: string;
  pageSize: number;
}

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  availableLanguages: string[];
  availableDomains: string[];
}

const LANGUAGE_LABELS: Record<string, string> = {
  hi: 'Hindi',
  be: 'Bengali',
  te: 'Telugu',
  ka: 'Kannada',
  ma: 'Marathi',
  as: 'Assamese',
  mr: 'Marathi',
};

const DOMAIN_LABELS: Record<string, string> = {
  agri: 'Agriculture',
  lega: 'Legal',
};

export function parseLanguageFromPromptId(promptId: string): string {
  const match = promptId.match(/^([a-z]{2})-/);
  return match ? match[1] : 'unknown';
}

export function parseDomainFromPromptId(promptId: string): string {
  if (promptId.includes('-agri-')) return 'agri';
  if (promptId.includes('-lega-')) return 'lega';
  return 'unknown';
}

export function getLanguageLabel(code: string): string {
  return LANGUAGE_LABELS[code] || code.toUpperCase();
}

export function getDomainLabel(code: string): string {
  return DOMAIN_LABELS[code] || code.charAt(0).toUpperCase() + code.slice(1);
}

export function FilterBar({
  filters,
  onFilterChange,
  availableLanguages,
  availableDomains,
}: FilterBarProps) {
  const selectBaseClass = `
    px-3 py-1.5 rounded-md border border-border bg-background
    text-sm text-foreground
    focus:outline-none focus:ring-2 focus:ring-primary/50
    cursor-pointer
  `;

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* Language filter */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Language:</label>
        <select
          value={filters.language}
          onChange={(e) => onFilterChange({ ...filters, language: e.target.value })}
          className={selectBaseClass}
        >
          <option value="all">All Languages</option>
          {availableLanguages.map((lang) => (
            <option key={lang} value={lang}>
              {getLanguageLabel(lang)}
            </option>
          ))}
        </select>
      </div>

      {/* Domain filter */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Domain:</label>
        <select
          value={filters.domain}
          onChange={(e) => onFilterChange({ ...filters, domain: e.target.value })}
          className={selectBaseClass}
        >
          <option value="all">All Domains</option>
          {availableDomains.map((domain) => (
            <option key={domain} value={domain}>
              {getDomainLabel(domain)}
            </option>
          ))}
        </select>
      </div>

      {/* Page size */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Show:</label>
        <select
          value={filters.pageSize}
          onChange={(e) => onFilterChange({ ...filters, pageSize: parseInt(e.target.value, 10) })}
          className={selectBaseClass}
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
      </div>
    </div>
  );
}
