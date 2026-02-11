'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NoteItem {
  title: string;
  summary: string;
  details: string;
}

const notes: NoteItem[] = [
  {
    title: 'Two Separate Tasks',
    summary: 'Workers did A/B comparisons AND rubric ratings — different tasks, different results.',
    details: `Workers completed two distinct evaluation tasks: (1) Head-to-head comparisons where they picked between two anonymous responses, and (2) Rubric-based ratings where they scored a single response on trust, fluency, complexity, and code-switching. Interestingly, the same workers often showed different preferences across these tasks — preferring Opus in direct comparisons but rating Sonnet slightly higher on individual criteria.`,
  },
  {
    title: 'Position Bias',
    summary: 'Workers slightly favored whichever response was shown second.',
    details: `We randomized which model appeared as "Response A" vs "Response B" to control for this. The effect was measurable (~6.5 percentage points overall) but varied significantly by language. Malayalam showed the strongest position effect (26.5pp swing), while Telugu showed the smallest (1.6pp). The 63% Opus preference persists after controlling for position.`,
  },
  {
    title: 'Non-Expert Evaluators',
    summary: 'Workers were native speakers, not lawyers or agronomists.',
    details: `Karya workers are native speakers from each language region, but they are not legal professionals or agricultural experts. They evaluated responses based on fluency, clarity, cultural appropriateness, and perceived trustworthiness — not technical accuracy. This means the evaluation captures "does this feel like a good answer" rather than "is this legally/agriculturally correct."`,
  },
  {
    title: 'Single-Rater Design',
    summary: 'Each comparison was evaluated by one person.',
    details: `For cost and logistics reasons, each question-pair was evaluated by exactly one worker. We validated consistency through worker reliability scoring: measuring scale usage (do they use the full rating scale?), cross-criterion consistency (do their ratings correlate sensibly?), and sample size. 78% of workers who completed multiple comparisons independently preferred Opus overall.`,
  },
  {
    title: 'Independent Question Sets',
    summary: 'Each language had its own question set (not translations).',
    details: `The questions were created independently for each language by native speakers, reflecting locally relevant legal and agricultural concerns. This means we cannot compare performance on "the same question" across languages — the questions themselves are different. Cross-language comparisons are about overall patterns, not specific queries.`,
  },
  {
    title: 'LLM Judge Comparison',
    summary: 'We also ran the responses through Weval\'s LLM judge pipeline.',
    details: `To compare human and AI evaluation, we ran the same 9,293 prompts through Weval with LLM judges (GPT-4o, Claude 3.5 Sonnet, Qwen, GLM). The LLM judges showed near-zero correlation with human ratings and systematic biases: overrating fluency (+24 points) and underrating code-switching (-34 points). This suggests LLM judges apply English-centric heuristics that don't match native speaker judgment.`,
  },
];

export function MethodologyNotes() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <section className="py-16 sm:py-24" aria-labelledby="methodology-title">
      <h2
        id="methodology-title"
        className="text-2xl sm:text-3xl font-semibold text-foreground mb-4"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        Things to Know
      </h2>

      <p className="text-base sm:text-lg text-muted-foreground mb-6 sm:mb-8">
        Important context for interpreting these results.
      </p>

      <div className="space-y-2 sm:space-y-3">
        {notes.map((note, index) => {
          const isExpanded = expandedIndex === index;
          const panelId = `methodology-panel-${index}`;

          return (
            <div
              key={note.title}
              className={cn(
                "border rounded-lg overflow-hidden transition-all",
                isExpanded ? "border-primary/30" : "border-border"
              )}
            >
              <button
                onClick={() => setExpandedIndex(isExpanded ? null : index)}
                className="w-full p-3 sm:p-4 text-left hover:bg-muted/30 transition-colors flex items-start gap-3"
                aria-expanded={isExpanded}
                aria-controls={panelId}
              >
                <div className="flex-shrink-0 mt-0.5" aria-hidden="true">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm sm:text-base">{note.title}</div>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">{note.summary}</p>
                </div>
              </button>

              {isExpanded && (
                <div id={panelId} className="px-3 sm:px-4 pb-3 sm:pb-4 pl-10 sm:pl-11">
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                    {note.details}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
