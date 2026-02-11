import React from 'react';

const headingStyles = {
  fontFamily: '"Source Serif 4", Georgia, Cambria, "Times New Roman", Times, serif',
};

export function ImplicationsSection() {
  return (
    <section className="space-y-6">
      <h2
        className="text-2xl font-semibold"
        style={headingStyles}
      >
        Implications
      </h2>

      <div className="prose prose-slate dark:prose-invert max-w-none">
        <p className="text-lg text-muted-foreground leading-relaxed">
          These findings have significant implications for model selection, evaluation methodology,
          and deploying AI systems across languages and cultures.
        </p>
      </div>

      <div className="space-y-4">
        {/* Model Selection */}
        <div className="flex gap-4 p-4 bg-violet-500/5 dark:bg-violet-500/10 border border-violet-500/20 rounded-lg">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center">
            <span className="text-violet-600 dark:text-violet-400 font-bold">1</span>
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold" style={headingStyles}>
              Model choice should be language and domain-aware
            </h3>
            <p className="text-sm text-muted-foreground">
              Performance varies significantly by language—Sonnet excels in Hindi while Opus leads
              in Bengali and Kannada. For agricultural content, Opus shows a clear advantage.
              One model doesn&apos;t fit all multilingual use cases.
            </p>
          </div>
        </div>

        {/* Human evaluation */}
        <div className="flex gap-4 p-4 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">2</span>
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold" style={headingStyles}>
              Native speaker evaluation is essential for multilingual AI
            </h3>
            <p className="text-sm text-muted-foreground">
              LLM judges alone cannot capture the nuances of fluency and naturalness
              that native speakers recognize. For high-stakes multilingual deployments,
              human evaluation remains critical.
            </p>
          </div>
        </div>

        {/* Code-switching */}
        <div className="flex gap-4 p-4 bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
            <span className="text-blue-600 dark:text-blue-400 font-bold">3</span>
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold" style={headingStyles}>
              LLM judges need calibration for code-switching norms
            </h3>
            <p className="text-sm text-muted-foreground">
              Code-switching (mixing English with local languages) is a natural and often
              preferred communication style in multilingual communities. LLM judges trained
              primarily on monolingual data may incorrectly penalize this behavior.
            </p>
          </div>
        </div>

        {/* Fluency */}
        <div className="flex gap-4 p-4 bg-purple-500/5 dark:bg-purple-500/10 border border-purple-500/20 rounded-lg">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center">
            <span className="text-purple-600 dark:text-purple-400 font-bold">4</span>
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold" style={headingStyles}>
              Fluency detection in non-English needs improvement
            </h3>
            <p className="text-sm text-muted-foreground">
              The significant gap in fluency ratings suggests LLMs may lack the training
              data or linguistic understanding to accurately assess fluency in Indian languages.
              Over-rating fluency could mask real quality issues.
            </p>
          </div>
        </div>

        {/* Correlation */}
        <div className="flex gap-4 p-4 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
            <span className="text-amber-600 dark:text-amber-400 font-bold">5</span>
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold" style={headingStyles}>
              Correlation matters as much as average scores
            </h3>
            <p className="text-sm text-muted-foreground">
              Even when mean scores align, low correlation indicates that humans and LLMs
              are measuring different things. A comprehensive evaluation should consider
              both alignment of averages and correlation of individual judgments.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
