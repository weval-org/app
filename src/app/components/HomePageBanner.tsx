import React from 'react';
import { BLUEPRINT_CONFIG_REPO_URL, APP_REPO_URL } from '@/lib/configConstants';

export default function HomePageBanner() {
  return (
    <div className="w-full bg-background pt-6 pb-2 text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 md:flex md:space-x-6">
        <section aria-labelledby="prose-article" className="md:w-2/3">
          <p className="text-sm sm:text-base text-foreground/80 dark:text-slate-300/80 leading-relaxed max-w-3xl mx-auto">
            Standard AI benchmarks, even landmark projects like <a href="https://crfm.stanford.edu/helm/" target="_blank" rel="noopener noreferrer" className="text-primary dark:text-sky-400 hover:underline">Stanford's HELM</a>, provide a vital measure of a model's general capabilities. But they do not ask a different, more difficult set of questions: Can an AI correctly interpret the Geneva Conventions? Can it recognize a leading question designed to spread misinformation? Can it avoid making US-centric assumptions? <a href="https://arxiv.org/abs/2505.18893v4" target="_blank" rel="noopener noreferrer" className="text-primary dark:text-sky-400 hover:underline">Researchers warn</a> that evaluating models without asking these kinds of value-laden questions creates a dangerous blind spot, missing the context-specific failures that emerge in the real world.
          </p>
          <p className="text-sm sm:text-base text-foreground/80 dark:text-slate-300/80 leading-relaxed max-w-3xl mx-auto mt-4">
            CivicEval is built to fill this exact gap. It audits the foundational prerequisites for responsible AI behavior, asking: Does a model have the essential knowledge of law and human rights, the situational awareness for sensitive contexts, and the resilience to manipulation required to earn public trust? By testing these core competencies, CivicEval provides a crucial leading indicator of an AI's fitness for civic life.
          </p>
        </section>

        <section aria-labelledby="why-civiceval-matters-heading" className="md:w-1/3 mt-6 md:mt-0">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4 md:gap-5">
            <div className="bg-card/40 dark:bg-slate-800/40 backdrop-blur-sm p-4 rounded-lg shadow-md ring-1 ring-border/50 dark:ring-slate-700/50 flex flex-col h-full">
              <h3 className="text-base font-semibold text-highlight-success dark:text-highlight-success mb-1.5">
                Open Source & Collaborative Evals
              </h3>
              <p className="text-sm text-foreground/80 dark:text-slate-300/80 leading-relaxed flex-grow">
                All our tests, data, and code are open-source. We invite public scrutiny and contributions. You can add your own civic-minded evaluation blueprints to <a href="https://civiceval.org" className="text-highlight-success dark:text-highlight-success hover:underline">civiceval.org</a> itself, or even ship your own version of CivicEval for the domain of your choice.
              </p>
              <div className="mt-4 pt-3 border-t border-border/30 dark:border-slate-700/30 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={APP_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-highlight-success text-sm font-medium rounded-md text-highlight-success hover:bg-highlight-success/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-highlight-success dark:ring-offset-slate-800 transition-colors"
                >
                  View App on GitHub
                </a>
                <a
                  href={BLUEPRINT_CONFIG_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md text-highlight-success-foreground bg-highlight-success hover:bg-highlight-success/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-highlight-success dark:ring-offset-slate-800 transition-colors shadow-sm hover:shadow-md"
                >
                  Explore Blueprints
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

