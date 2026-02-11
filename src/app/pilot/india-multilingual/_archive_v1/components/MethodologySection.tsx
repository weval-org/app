import React from 'react';

const headingStyles = {
  fontFamily: '"Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif',
};

interface MethodologySectionProps {
  models: string[];
  promptCount: number;
}

export function MethodologySection({ models, promptCount }: MethodologySectionProps) {
  // Format model names for display
  const formatModelName = (model: string) => {
    // Extract just the model name from provider:model format
    const parts = model.split(':');
    const name = parts[parts.length - 1].split('/').pop() || model;
    // Remove temperature suffix if present
    return name.replace(/\[temp:\d+\.?\d*\]/, '').trim();
  };

  const displayModels = models.map(formatModelName);

  return (
    <section className="space-y-6">
      <h2
        className="text-2xl font-semibold"
        style={headingStyles}
      >
        Methodology
      </h2>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Human Evaluators */}
        <div className="p-6 bg-muted/30 dark:bg-slate-900/40 rounded-lg space-y-4">
          <h3 className="font-semibold text-lg" style={headingStyles}>
            Human Evaluators
          </h3>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>120 native speakers via Karya platform</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>7 languages across India</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Legal advice & agricultural guidance domains</span>
            </li>
          </ul>
        </div>

        {/* LLM Judges */}
        <div className="p-6 bg-muted/30 dark:bg-slate-900/40 rounded-lg space-y-4">
          <h3 className="font-semibold text-lg" style={headingStyles}>
            LLM Judges
          </h3>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Multi-judge consensus (3 judges)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>Holistic evaluation approach</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-1">•</span>
              <span>5-point classification scale</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Criteria */}
      <div className="p-6 bg-muted/30 dark:bg-slate-900/40 rounded-lg space-y-4">
        <h3 className="font-semibold text-lg" style={headingStyles}>
          Evaluation Criteria
        </h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <div className="font-medium">Fluency</div>
            <div className="text-muted-foreground">Is the language natural and easy to read?</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium">Complexity</div>
            <div className="text-muted-foreground">Is the language complexity appropriate for a general audience?</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium">Code-switching</div>
            <div className="text-muted-foreground">Is the mix of English terminology balanced and helpful?</div>
          </div>
          <div className="space-y-1">
            <div className="font-medium">Trust</div>
            <div className="text-muted-foreground">Does the response provide accurate, actionable information?</div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="py-6 px-4 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 rounded-xl border border-primary/10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div className="space-y-1">
            <div className="text-3xl md:text-4xl font-bold text-primary">~10K</div>
            <div className="text-sm text-muted-foreground">Prompt-Response Pairs</div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl md:text-4xl font-bold text-primary">7</div>
            <div className="text-sm text-muted-foreground">Languages</div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl md:text-4xl font-bold text-primary">120+</div>
            <div className="text-sm text-muted-foreground">Native Speakers</div>
          </div>
          <div className="space-y-1">
            <div className="text-3xl md:text-4xl font-bold text-primary">2</div>
            <div className="text-sm text-muted-foreground">Claude Models</div>
          </div>
        </div>
      </div>
    </section>
  );
}
