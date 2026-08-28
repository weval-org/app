'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MethodNote {
  title: string;
  content: string;
}

const notes: MethodNote[] = [
  {
    title: 'Bridging Consensus',
    content:
      'A principle achieves "bridging consensus" when it receives >85% agreement across every demographic segment tested — not just overall, but within each country, Inglehart-Welzel cultural quadrant, AI sentiment group, gender, and age bracket. This is a deliberately high bar that ensures principles reflect genuine cross-cultural agreement rather than majority-rule outcomes that leave minorities behind.',
  },
  {
    title: 'Participant Recruitment',
    content:
      'Participants were recruited via Prolific, a research platform that enables representative sampling. Panels were drawn from the US, UK, and India with demographic quotas for age, gender, and region. The Inglehart-Welzel World Values Survey framework was used to map cultural values (traditional/secular and survival/self-expression axes). AI sentiment was measured via a purpose-built scale capturing excitement vs. concern about AI adoption.',
  },
  {
    title: 'Tension Resolution',
    content:
      'Where two principles conflicted (e.g., "provide all information" vs. "withhold dangerous details"), both were presented as a forced-choice scenario with a concrete example. Participants chose which approach they preferred. Scenarios achieving >50% bridging consensus across all segments were included. For the 5 hardest tensions, a follow-up survey with 306 participants generated new candidate resolutions that were then validated.',
  },
  {
    title: 'Vote Imputation (Stage 2)',
    content:
      'The topic crowdsourcing stage produced a 97.4% sparse vote matrix (most participants saw only a fraction of topics). SoftImpute matrix completion was used to estimate missing votes, with cross-validation selecting an optimal rank of 2 — meaning opinion structure on AI free expression topics is remarkably low-dimensional. Median uncertainty was ±0.6 percentage points at the group level.',
  },
  {
    title: 'Response Generation',
    content:
      'Seven frontier models (Claude Sonnet 4.6, Claude Haiku 4.5, Gemini 2.5 Flash, GPT-5 Mini, DeepSeek Chat v3.1, Llama 4 Maverick, Mistral Large 2512) generated responses across 8 parameter buckets (3 temperatures × 3 length targets, minus one). Two draws per cell yielded 111,528 candidate responses at approximately $102 total generation cost.',
  },
  {
    title: 'Behavioral Classification',
    content:
      'A random sample of 3,000 responses was classified into 6 behavioral categories (direct answer, answer with hedge, answer with caveats, answer with safety resources, partial refusal, full refusal) using an ensemble of 3 LLM judges with inter-rater agreement >92%. This classification enabled behavior-aware tuple formation that pairs responses with different behavioral approaches rather than just different formatting.',
  },
  {
    title: 'Criteria Synthesis',
    content:
      'The 7,347 criteria extracted from participants were tiered by a combination of bridging consensus and majority agreement. Tier 1 (15.1% of criteria) achieved both bridging ≥0.75 and majority ≥67%. A specialized "Tier N" captures "neither" responses — cases where participants felt neither response adequately addressed the principles, identifying gaps in current model behavior.',
  },
];

export function MethodologyNotes() {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div>
      <h2
        id="methodology-title"
        className="text-2xl sm:text-3xl font-semibold mb-3"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        Methodology
      </h2>
      <p className="text-muted-foreground mb-8 max-w-2xl">
        Technical details on how principles were elicited, validated, and used to build the
        evaluation framework.
      </p>

      <div className="space-y-2">
        {notes.map((note, i) => {
          const isExpanded = expandedIndex === i;
          return (
            <div key={note.title} className="border border-border/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors"
              >
                <span className="font-medium text-sm">{note.title}</span>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>
              {isExpanded && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">{note.content}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-muted/30 rounded-xl p-5 border border-border/50">
        <h4 className="font-medium text-sm mb-2">Data Quality</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Usable data', value: '99.8%' },
            { label: 'Avg agreement', value: '89%' },
            { label: 'LLM-approved criteria', value: '94.9%' },
            { label: 'Cross-country consistency', value: '88-90%' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-lg font-bold text-primary font-mono">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
