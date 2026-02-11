'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import type { SampleComparison } from '../V2Client';

interface LanguageData {
  language: string;
  decided: number;
  opusRate: number;
}

interface DataExplorerProps {
  samples: SampleComparison[];
  languageData: LanguageData[];
}

export function DataExplorer({ samples, languageData }: DataExplorerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // Filter samples
  const filteredSamples = useMemo(() => {
    return samples.filter(s => {
      if (s.workerChoice === 'unknown') return false;

      if (languageFilter !== 'all' && s.language !== languageFilter) return false;
      if (domainFilter !== 'all' && s.domain !== domainFilter) return false;
      if (outcomeFilter !== 'all' && s.workerChoice !== outcomeFilter) return false;

      if (search) {
        const searchLower = search.toLowerCase();
        return s.question.toLowerCase().includes(searchLower);
      }

      return true;
    });
  }, [samples, search, languageFilter, domainFilter, outcomeFilter]);

  const paginatedSamples = filteredSamples.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filteredSamples.length / pageSize);

  const languages = [...new Set(samples.map(s => s.language))].sort();
  const domains = [...new Set(samples.map(s => s.domain))].sort();

  const validSampleCount = samples.filter(s => s.workerChoice !== 'unknown').length;

  if (!isOpen) {
    return (
      <section className="py-16 sm:py-24" aria-labelledby="data-explorer-title-collapsed">
        <button
          onClick={() => setIsOpen(true)}
          className="w-full p-6 border border-border rounded-xl hover:border-primary/30 hover:bg-muted/30 transition-all text-left group"
          aria-expanded="false"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2
                id="data-explorer-title-collapsed"
                className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors"
                style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
              >
                Explore Sample Comparisons
              </h2>
              <p className="text-muted-foreground mt-2">
                Browse {validSampleCount.toLocaleString()} A/B comparisons with full responses
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Stratified sample: 50 per language, proportional to outcome distribution
              </p>
            </div>
            <ChevronRight className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" aria-hidden="true" />
          </div>
        </button>
      </section>
    );
  }

  return (
    <section className="py-16 sm:py-24" aria-labelledby="data-explorer-title">
      <div className="flex items-center justify-between mb-6">
        <h2
          id="data-explorer-title"
          className="text-2xl sm:text-3xl font-semibold text-foreground"
          style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
        >
          Explore Sample Comparisons
        </h2>
        <button
          onClick={() => setIsOpen(false)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Collapse
        </button>
      </div>

      {/* Filters */}
      <div className="bg-muted/30 rounded-xl p-4 mb-6 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search questions..."
            aria-label="Search questions"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary min-h-[44px]"
          />
        </div>

        {/* Filter dropdowns */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select
            value={languageFilter}
            onChange={(e) => { setLanguageFilter(e.target.value); setPage(0); }}
            aria-label="Filter by language"
            className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm min-h-[44px]"
          >
            <option value="all">All Languages</option>
            {languages.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <select
            value={domainFilter}
            onChange={(e) => { setDomainFilter(e.target.value); setPage(0); }}
            aria-label="Filter by domain"
            className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm min-h-[44px]"
          >
            <option value="all">All Domains</option>
            {domains.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <select
            value={outcomeFilter}
            onChange={(e) => { setOutcomeFilter(e.target.value); setPage(0); }}
            aria-label="Filter by outcome"
            className="w-full px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm min-h-[44px]"
          >
            <option value="all">All Outcomes</option>
            <option value="opus">Opus won</option>
            <option value="sonnet">Sonnet won</option>
            <option value="equal_good">Equally good</option>
            <option value="equal_bad">Equally bad</option>
          </select>
        </div>

        <div className="text-sm text-muted-foreground">
          Showing {paginatedSamples.length} of {filteredSamples.length.toLocaleString()} comparisons
        </div>
      </div>

      {/* Results */}
      <div className="space-y-2">
        {paginatedSamples.map((sample, index) => {
          const globalIndex = page * pageSize + index;
          const isExpanded = expandedIndex === globalIndex;
          const responseAIsOpus = sample.answer1Model.includes('opus');

          return (
            <div
              key={globalIndex}
              className={cn(
                "border rounded-lg overflow-hidden transition-all",
                isExpanded ? "border-primary/30" : "border-border"
              )}
            >
              <button
                onClick={() => setExpandedIndex(isExpanded ? null : globalIndex)}
                className="w-full p-4 text-left hover:bg-muted/30 transition-colors"
                aria-expanded={isExpanded}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        sample.workerChoice === 'opus' ? "bg-primary/20 text-primary" :
                          sample.workerChoice === 'sonnet' ? "bg-amber-500/20 text-amber-600" :
                            sample.workerChoice === 'equal_good' ? "bg-emerald-500/20 text-emerald-600" :
                              "bg-red-500/20 text-red-600"
                      )}>
                        {sample.workerChoice === 'opus' ? 'Opus' :
                          sample.workerChoice === 'sonnet' ? 'Sonnet' :
                            sample.workerChoice === 'equal_good' ? 'Equal ✓' : 'Equal ✗'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {sample.language} · {sample.domain}
                      </span>
                    </div>
                    <p className="text-sm line-clamp-2">{sample.question}</p>
                  </div>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-border bg-muted/10">
                  <div className="pt-4 space-y-4">
                    {/* Full question */}
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Question</div>
                      <p className="text-sm">{sample.question}</p>
                    </div>

                    {/* Responses side by side */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className={cn(
                        "p-3 rounded-lg border",
                        (sample.workerChoice === 'opus' && responseAIsOpus) || (sample.workerChoice === 'sonnet' && !responseAIsOpus)
                          ? "border-primary/30 bg-primary/5"
                          : "border-border"
                      )}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium">Response A</span>
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded",
                            responseAIsOpus ? "bg-primary/20 text-primary" : "bg-amber-500/20 text-amber-600"
                          )}>
                            {responseAIsOpus ? 'Opus' : 'Sonnet'}
                          </span>
                        </div>
                        <div className="text-xs prose prose-xs dark:prose-invert max-w-none line-clamp-6">
                          <ResponseRenderer content={sample.answer1} renderAs="html" />
                        </div>
                      </div>

                      <div className={cn(
                        "p-3 rounded-lg border",
                        (sample.workerChoice === 'opus' && !responseAIsOpus) || (sample.workerChoice === 'sonnet' && responseAIsOpus)
                          ? "border-primary/30 bg-primary/5"
                          : "border-border"
                      )}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-medium">Response B</span>
                          <span className={cn(
                            "text-xs px-1.5 py-0.5 rounded",
                            !responseAIsOpus ? "bg-primary/20 text-primary" : "bg-amber-500/20 text-amber-600"
                          )}>
                            {!responseAIsOpus ? 'Opus' : 'Sonnet'}
                          </span>
                        </div>
                        <div className="text-xs prose prose-xs dark:prose-invert max-w-none line-clamp-6">
                          <ResponseRenderer content={sample.answer2} renderAs="html" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1 text-sm border border-border rounded hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 text-sm border border-border rounded hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
