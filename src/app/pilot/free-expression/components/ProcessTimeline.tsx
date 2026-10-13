'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Stage {
  number: number;
  title: string;
  subtitle: string;
  participants: string;
  description: string;
  details: string[];
  output: string;
  color: string;
}

const stages: Stage[] = [
  {
    number: 1,
    title: 'Principle Elicitation & Validation',
    subtitle: 'What should AI do when it might restrict expression?',
    participants: '2,149 participants across 4 surveys',
    description:
      'Open-ended surveys asked participants to articulate principles for AI behavior around free expression. 100 synthesized principles were then tested for bridging consensus across all demographic segments.',
    details: [
      '829 participants in initial open-ended elicitation via Remesh.ai',
      '100 synthesized principles + 23 identified tension pairs',
      '1,014 participants validated 56 non-tension principles + 12 forced-choice scenarios',
      '306 participants resolved 5 hardest tensions in follow-up survey',
      'Bridging consensus threshold: >85% agreement across ALL demographic segments',
    ],
    output: '44 validated principles (25 core + 7 scenarios + 7 conditional rules + 5 split resolutions)',
    color: 'bg-primary',
  },
  {
    number: 2,
    title: 'Topic Crowdsourcing & Prompt Generation',
    subtitle: 'What topics should AI be willing to discuss?',
    participants: '809 participants in deliberative poll',
    description:
      'A custom Polis-like deliberation platform let participants vote on and submit topics where AI might unfairly restrict expression. Topics were clustered, filtered, and expanded into 1,000 natural-language prompts.',
    details: [
      '1,438 unique topics submitted with 34,814 votes',
      'Vote imputation (SoftImpute) to handle 97.4% sparsity — optimal rank = 2',
      '491 good topics identified; 301 robust under both bridging methods',
      '100 topics selected via semantic clustering + 10 controversial stress-tests',
      '1,000 prompts generated (100 topics × 10 task types)',
    ],
    output: '360 selected prompts spanning 60 topics across 10 task types',
    color: 'bg-primary/80',
  },
  {
    number: 3,
    title: 'Criteria Elicitation & Evaluation',
    subtitle: 'How should we judge AI responses on these topics?',
    participants: '1,092 participants evaluating blind A/B pairs',
    description:
      'Seven frontier models generated 111,000+ responses. Participants compared blind response pairs against the validated principles, then articulated and voted on specific criteria for what makes a response better.',
    details: [
      '111,528 response candidates from 7 models × 8 parameter settings',
      'Behavioral classification: 90.6% direct answers, 0.00% full refusals',
      '380 behavior-aware comparison tuples (contrasting different response strategies)',
      '7,347 criteria extracted via LLM-assisted dialogue (94.9% participant acceptance)',
      'Tiered criteria: 15.1% bridging consensus, 9.2% strong, 44.3% majority',
    ],
    output: '300-prompt evaluation set with principle-grounded scoring rubric',
    color: 'bg-primary/60',
  },
];

export function ProcessTimeline() {
  const [expandedStage, setExpandedStage] = useState<number | null>(null);

  return (
    <div className="space-y-6">
      {stages.map((stage) => {
        const isExpanded = expandedStage === stage.number;
        return (
          <div
            key={stage.number}
            className="relative border border-border/50 rounded-xl overflow-hidden transition-all"
          >
            {/* Stage header */}
            <button
              onClick={() => setExpandedStage(isExpanded ? null : stage.number)}
              className="w-full text-left p-5 sm:p-6 hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* Stage number badge */}
                <div
                  className={cn(
                    'shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground',
                    stage.color
                  )}
                >
                  {stage.number}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-base sm:text-lg">{stage.title}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5 italic">
                        {stage.subtitle}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0 mt-1" />
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground mt-2">{stage.description}</p>
                  <p className="text-xs text-primary font-medium mt-2">{stage.participants}</p>
                </div>
              </div>
            </button>

            {/* Expanded details */}
            {isExpanded && (
              <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-0 border-t border-border/50">
                <div className="ml-14">
                  <ul className="space-y-2 mt-4">
                    {stage.details.map((detail, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-primary mt-1 text-xs">&#9679;</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 bg-primary/5 rounded-lg p-3 border border-primary/20">
                    <p className="text-sm">
                      <span className="font-medium text-primary">Output:</span> {stage.output}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Connecting visualization */}
      <div className="text-center pt-4">
        <p className="text-sm text-muted-foreground">
          Each stage builds on the previous — principles inform topics, topics generate prompts,
          prompts elicit criteria.
        </p>
      </div>
    </div>
  );
}
