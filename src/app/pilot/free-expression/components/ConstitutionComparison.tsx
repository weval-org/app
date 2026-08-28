'use client';

import React from 'react';

interface ComparisonItem {
  area: string;
  crowdsourced: string;
  constitution: string;
  alignment: 'converge' | 'diverge' | 'gap';
}

const comparisons: ComparisonItem[] = [
  {
    area: 'Information Access',
    crowdsourced: 'Provide all factual information with warnings; don\'t gatekeep',
    constitution: 'Value free flow of information unless high risk of serious harm',
    alignment: 'converge',
  },
  {
    area: 'Uncertainty & Honesty',
    crowdsourced: 'State uncertainty clearly; cite sources; distinguish established from uncertain',
    constitution: 'Be honest about confidence levels; acknowledge limitations',
    alignment: 'converge',
  },
  {
    area: 'Balanced Perspectives',
    crowdsourced: 'Note other perspectives exist on debated topics; offer to present them',
    constitution: 'Present strongest versions of multiple viewpoints when experts disagree',
    alignment: 'converge',
  },
  {
    area: 'Safety Apparatus',
    crowdsourced: 'Include warnings, safety resources, and disclaimers alongside information',
    constitution: 'Avoid excessive warnings that make responses less useful',
    alignment: 'diverge',
  },
  {
    area: 'User Autonomy',
    crowdsourced: 'Follow instructions UNLESS directly enable serious harm; reject AI as interrogator of intent',
    constitution: 'Treat users as intelligent adults; don\'t be overly cautious',
    alignment: 'diverge',
  },
  {
    area: 'Charitable Interpretation',
    crowdsourced: 'Not strongly endorsed — public uncomfortable with benefit-of-doubt on ambiguous requests (61.9%)',
    constitution: 'Assume good faith; give benefit of the doubt on sensitive topics',
    alignment: 'diverge',
  },
  {
    area: 'Source Citation',
    crowdsourced: 'Strong emphasis: cite sources (96.4%), provide links (96.1%), credit information',
    constitution: 'Less emphasized — focus on content quality over citation mechanics',
    alignment: 'gap',
  },
  {
    area: 'Omission Transparency',
    crowdsourced: 'State what was left out and why (90.8%); mention content restrictions (91.4%)',
    constitution: 'Be honest about what\'s being refused; don\'t secretly provide lesser responses',
    alignment: 'converge',
  },
];

export function ConstitutionComparison() {
  return (
    <div>
      <h2
        id="constitution-title"
        className="text-2xl sm:text-3xl font-semibold mb-3"
        style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
      >
        Bottom-Up vs. Top-Down
      </h2>
      <p className="text-muted-foreground mb-8 max-w-2xl">
        How do crowdsourced principles from 2,200+ participants compare to principles
        from Claude&rsquo;s published Constitution — a well-known reference point for AI
        value alignment? 30 Constitution principles were extracted, reformulated, and
        tested in a blinded validation survey.
      </p>

      <div className="space-y-3">
        {comparisons.map((item) => (
          <div
            key={item.area}
            className="border border-border/50 rounded-lg p-4 hover:bg-muted/10 transition-colors"
          >
            <div className="flex items-start gap-3 mb-3">
              <span
                className={`shrink-0 mt-0.5 w-2.5 h-2.5 rounded-full ${
                  item.alignment === 'converge'
                    ? 'bg-primary'
                    : item.alignment === 'diverge'
                      ? 'bg-amber-500'
                      : 'bg-blue-500'
                }`}
              />
              <div className="flex-1">
                <div className="flex items-baseline justify-between">
                  <h4 className="font-medium text-sm">{item.area}</h4>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      item.alignment === 'converge'
                        ? 'bg-primary/10 text-primary'
                        : item.alignment === 'diverge'
                          ? 'bg-amber-500/10 text-amber-600'
                          : 'bg-blue-500/10 text-blue-600'
                    }`}
                  >
                    {item.alignment === 'converge'
                      ? 'Aligned'
                      : item.alignment === 'diverge'
                        ? 'Tension'
                        : 'Gap'}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 ml-5.5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Crowdsourced
                </p>
                <p className="text-sm">{item.crowdsourced}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Constitution
                </p>
                <p className="text-sm">{item.constitution}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-6 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-primary" /> Aligned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Tension
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Gap (crowdsourced emphasis
          not in Constitution)
        </span>
      </div>

      <div className="mt-8 bg-primary/5 rounded-xl p-5 border border-primary/20">
        <p className="text-sm leading-relaxed">
          <strong>Key insight:</strong> The crowdsourced framework and the Claude Constitution
          largely converge on information access, honesty, and balanced perspectives. They diverge
          on <em>how much safety apparatus is appropriate</em> — the public wants more warnings and
          disclaimers than the Constitution prescribes — and on <em>charitable interpretation</em>,
          where the public is more cautious than the Constitution&rsquo;s &ldquo;assume good
          faith&rdquo; stance.
        </p>
      </div>
    </div>
  );
}
