'use client';

import React, { useState, useMemo } from 'react';
import { ConversationMessage, LLMCoverageScores } from '@/types/shared';
import { FilterBar, FilterState, parseLanguageFromPromptId, parseDomainFromPromptId } from './FilterBar';
import { PromptRow } from './PromptRow';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const headingStyles = {
  fontFamily: '"Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif',
};

interface PromptExplorerProps {
  promptIds: string[];
  promptContexts: Record<string, string | ConversationMessage[]>;
  llmCoverageScores: LLMCoverageScores;
  models: string[];
  configId: string;
  runLabel: string;
  timestamp: string;
}

interface PromptEntry {
  promptId: string;
  modelId: string;
  language: string;
  domain: string;
  humanScore: number | null;
  llmScore: number | null;
}

export function PromptExplorer({
  promptIds,
  promptContexts,
  llmCoverageScores,
  models,
  configId,
  runLabel,
  timestamp,
}: PromptExplorerProps) {
  const [filters, setFilters] = useState<FilterState>({
    language: 'all',
    domain: 'all',
    pageSize: 25,
  });
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Build flat list of all prompt×model entries with scores
  const allEntries = useMemo(() => {
    const entries: PromptEntry[] = [];

    for (const promptId of promptIds) {
      const language = parseLanguageFromPromptId(promptId);
      const domain = parseDomainFromPromptId(promptId);

      for (const modelId of models) {
        const coverage = llmCoverageScores[promptId]?.[modelId];
        if (!coverage) continue;

        const humanRatings = coverage.humanRatings;
        const humanScore = humanRatings?.composite ?? null;
        const llmScore = coverage.avgCoverageExtent ?? null;

        entries.push({
          promptId,
          modelId,
          language,
          domain,
          humanScore,
          llmScore,
        });
      }
    }

    return entries;
  }, [promptIds, models, llmCoverageScores]);

  // Extract available languages and domains
  const availableLanguages = useMemo(() => {
    const langs = new Set(allEntries.map((e) => e.language));
    return Array.from(langs).filter((l) => l !== 'unknown').sort();
  }, [allEntries]);

  const availableDomains = useMemo(() => {
    const domains = new Set(allEntries.map((e) => e.domain));
    return Array.from(domains).filter((d) => d !== 'unknown').sort();
  }, [allEntries]);

  // Apply filters
  const filteredEntries = useMemo(() => {
    return allEntries.filter((entry) => {
      if (filters.language !== 'all' && entry.language !== filters.language) {
        return false;
      }
      if (filters.domain !== 'all' && entry.domain !== filters.domain) {
        return false;
      }
      return true;
    });
  }, [allEntries, filters]);

  // Pagination
  const totalPages = Math.ceil(filteredEntries.length / filters.pageSize);
  const paginatedEntries = filteredEntries.slice(
    currentPage * filters.pageSize,
    (currentPage + 1) * filters.pageSize
  );

  // Reset page when filters change
  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(0);
    setExpandedKey(null);
  };

  const handleToggle = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2
          className="text-2xl font-semibold"
          style={headingStyles}
        >
          Prompt Explorer
        </h2>
        <p className="text-muted-foreground">
          Browse all prompts with human and LLM ratings. Click to expand for full response and score comparison.
        </p>
      </div>

      {/* Filters */}
      <FilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        availableLanguages={availableLanguages}
        availableDomains={availableDomains}
      />

      {/* Results summary */}
      <div className="text-sm text-muted-foreground">
        Showing {paginatedEntries.length} of {filteredEntries.length} results
        {filteredEntries.length !== allEntries.length && (
          <span> (filtered from {allEntries.length} total)</span>
        )}
      </div>

      {/* Prompt rows */}
      <div className="space-y-3">
        {paginatedEntries.map((entry) => {
          const key = `${entry.promptId}_${entry.modelId}`;
          const coverage = llmCoverageScores[entry.promptId]?.[entry.modelId] ?? null;
          const promptContext = promptContexts[entry.promptId] || '';

          return (
            <PromptRow
              key={key}
              promptId={entry.promptId}
              language={entry.language}
              domain={entry.domain}
              modelId={entry.modelId}
              humanScore={entry.humanScore}
              llmScore={entry.llmScore}
              promptContext={promptContext}
              coverage={coverage}
              configId={configId}
              runLabel={runLabel}
              timestamp={timestamp}
              isExpanded={expandedKey === key}
              onToggle={() => handleToggle(key)}
            />
          );
        })}

        {paginatedEntries.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No prompts match the current filters.
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4">
          <button
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <div className="text-sm text-muted-foreground">
            Page {currentPage + 1} of {totalPages}
          </div>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
}
