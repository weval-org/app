'use client';

import React from 'react';
import { List } from 'lucide-react';

interface TOCItem {
  id: string;
  label: string;
  subtitle?: string;
}

const tocItems: TOCItem[] = [
  { id: 'head-to-head', label: 'Head-to-Head Comparisons', subtitle: 'Which response did workers prefer?' },
  { id: 'rubric-ratings', label: 'Rubric-Based Ratings', subtitle: 'Scores on trust, fluency, complexity, code-switching' },
  { id: 'the-paradox', label: 'The Paradox', subtitle: 'Same workers, two different answers' },
  { id: 'evaluators', label: 'The Evaluators', subtitle: 'Worker reliability and profiles' },
  { id: 'human-vs-llm', label: 'Human vs. LLM Judges', subtitle: 'Do AI judges agree with native speakers?' },
  { id: 'methodology', label: 'Methodology', subtitle: 'How we collected and analyzed the data' },
  { id: 'data-explorer', label: 'Data Explorer', subtitle: 'Browse individual comparisons' },
];

export function TableOfContents() {
  return (
    <nav className="my-8 sm:my-12" aria-label="Table of contents">
      <div className="bg-muted/30 rounded-xl p-4 sm:p-6 border border-border">
        <div className="flex items-center gap-2 mb-4">
          <List className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Contents
          </h2>
        </div>

        <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {tocItems.map((item, index) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="group flex items-start gap-3 py-1.5 text-sm hover:text-primary transition-colors"
              >
                <span className="text-muted-foreground font-mono text-xs mt-0.5 w-4">
                  {index + 1}.
                </span>
                <span>
                  <span className="font-medium group-hover:underline">{item.label}</span>
                  {item.subtitle && (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {item.subtitle}
                    </span>
                  )}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
