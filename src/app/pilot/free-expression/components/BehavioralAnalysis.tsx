'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface BehaviorCategory {
  label: string;
  percentage: number;
  description: string;
  color: string;
}

const categories: BehaviorCategory[] = [
  {
    label: 'Direct Answer',
    percentage: 90.6,
    description: 'Substantive answer without notable safety apparatus',
    color: 'bg-primary',
  },
  {
    label: 'Answer with Hedge',
    percentage: 4.2,
    description: '"Consult a doctor," "not medical advice" — professional deferral',
    color: 'bg-primary/60',
  },
  {
    label: 'Answer with Caveats',
    percentage: 2.7,
    description: 'Front-loaded warnings and disclaimers before answering',
    color: 'bg-primary/40',
  },
  {
    label: 'Answer with Safety',
    percentage: 2.1,
    description: 'Includes hotlines, crisis numbers, or professional referrals',
    color: 'bg-amber-500/70',
  },
  {
    label: 'Partial Refusal',
    percentage: 0.37,
    description: 'Refuses core ask but provides an alternative approach',
    color: 'bg-destructive/50',
  },
  {
    label: 'Full Refusal',
    percentage: 0.0,
    description: 'Zero observed across 3,000 responses',
    color: 'bg-destructive',
  },
];

interface ModelProfile {
  name: string;
  directRate: number;
  distinctive: string;
}

const models: ModelProfile[] = [
  { name: 'Gemini 2.5 Flash', directRate: 92.3, distinctive: 'Most direct — minimal safety apparatus' },
  { name: 'Claude Sonnet 4.6', directRate: 87.9, distinctive: 'Most qualified — highest safety resource rate (4.2%)' },
  { name: 'GPT-5 Mini', directRate: 89.1, distinctive: 'Distinctive partial refusal pattern (1.4%) on persuasive writing' },
  { name: 'Llama 4 Maverick', directRate: 88.5, distinctive: 'High hedge rate (5.2%)' },
  { name: 'DeepSeek Chat v3.1', directRate: 90.2, distinctive: 'Balanced profile' },
  { name: 'Mistral Large', directRate: 89.8, distinctive: 'High hedge rate (3.8%)' },
];

export function BehavioralAnalysis() {
  return (
    <div className="mt-10 space-y-8">
      {/* Behavior distribution */}
      <div>
        <h4 className="font-medium mb-4 text-sm uppercase tracking-wide text-muted-foreground">
          Response behavior distribution (N=3,000)
        </h4>
        <div className="space-y-3">
          {categories.map((cat) => (
            <div key={cat.label} className="group">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm font-medium">{cat.label}</span>
                <span
                  className={cn(
                    'text-sm font-mono',
                    cat.percentage === 0 ? 'text-destructive font-bold' : 'text-muted-foreground'
                  )}
                >
                  {cat.percentage === 0 ? '0.00%' : `${cat.percentage}%`}
                </span>
              </div>
              <div className="h-6 bg-muted/30 rounded overflow-hidden">
                <div
                  className={cn('h-full rounded transition-all', cat.color)}
                  style={{ width: `${Math.max(cat.percentage, 0.3)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">{cat.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Model profiles */}
      <div>
        <h4 className="font-medium mb-4 text-sm uppercase tracking-wide text-muted-foreground">
          Model behavioral profiles
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {models.map((model) => (
            <div
              key={model.name}
              className="bg-muted/30 rounded-lg p-4 border border-border/50"
            >
              <div className="flex items-baseline justify-between mb-1">
                <h5 className="text-sm font-medium">{model.name}</h5>
                <span className="text-xs font-mono text-primary">{model.directRate}%</span>
              </div>
              <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${model.directRate}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{model.distinctive}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-primary/5 rounded-xl p-5 border border-primary/20">
        <p className="text-sm leading-relaxed">
          <strong>Implication:</strong> The era of wholesale refusals is over. The real policy
          boundary question is no longer &ldquo;will the model answer?&rdquo; but{' '}
          <em>how much safety apparatus</em> it wraps around the answer — hedging, caveats,
          safety resources, or disclaimers. These behavioral differences are where model
          personality emerges.
        </p>
      </div>
    </div>
  );
}
