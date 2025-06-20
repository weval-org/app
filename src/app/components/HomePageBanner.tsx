import React from 'react';
import { BLUEPRINT_CONFIG_REPO_URL, APP_REPO_URL } from '@/lib/configConstants';

export default function HomePageBanner() {
  return (
    <div className="w-full bg-background pt-6 pb-2 text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 md:flex md:space-x-6">
        <section aria-labelledby="prose-article" className="md:w-2/3">
          <p className="text-sm sm:text-base text-foreground/80 dark:text-slate-300/80 leading-relaxed max-w-3xl mx-auto">
            Standard benchmarks, like those in <a href="https://crfm.stanford.edu/helm/latest/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Stanford's HELM</a>, provide a vital measure of a model's general capabilities. But they do not ask a different, more difficult set of questions: Can an AI correctly interpret a complex legal text? Can it avoid reproducing harmful stereotypes when asked about a specific demographic group? Can it summarize a technical document about climate change without omitting key details?
          </p>
          <p className="text-sm sm:text-base text-foreground/80 dark:text-slate-300/80 leading-relaxed max-w-3xl mx-auto mt-4">
            <a href="https://www.anthropic.com/index/evaluating-large-language-models" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Researchers warn</a> that evaluating models without asking these kinds of value-laden questions creates a dangerous blind spot, missing the context-specific failures that can cause the most harm. <strong>Weval</strong> is an open-source framework designed to fill this gap, enabling transparent, independent, and continuous evaluation of LLMs on civic, legal, and human rights-oriented topics.
          </p>
        </section>

        <section aria-labelledby="why-weval-matters-heading" className="md:w-1/3 mt-6 md:mt-0">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4 md:gap-5">
            <div className="bg-card/40 dark:bg-slate-800/40 backdrop-blur-sm p-4 rounded-lg shadow-md ring-1 ring-border/50 dark:ring-slate-700/50 flex flex-col h-full">
              <h3 className="text-base font-semibold text-highlight-success dark:text-highlight-success mb-1.5">
                Open Source & Collaborative Evals
              </h3>
              <p className="text-sm text-foreground/80 dark:text-slate-300/80 leading-relaxed flex-grow">
                All our tests, data, and code are open-source. We invite public scrutiny and contributions. You can add your own evaluation blueprints to <a href="https://weval.org" className="text-highlight-success dark:text-highlight-success hover:underline">weval.org</a> itself, or even ship your own version of Weval for the topic of your choice.
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

