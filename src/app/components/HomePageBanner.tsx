import React from 'react';
import { BLUEPRINT_CONFIG_REPO_URL, APP_REPO_URL } from '@/lib/configConstants';

export default function HomePageBanner() {
  return (
    <div className="w-full bg-background pt-6 pb-2 text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 md:flex md:space-x-6">
        <section
          aria-labelledby="prose-article"
          className="md:w-2/3 text-sm sm:text-base text-foreground/80 dark:text-muted-foreground leading-relaxed space-y-4"
        >
          <p>
            <strong>Current AI evaluations measure what's easy, not what's important.</strong> Benchmarks that rely on multiple-choice questions or simple
            pass/fail tests can't capture the nuance of real-world tasks. They
            can tell you if code runs, but not if it's well-written. They can
            test for textbook knowledge, but not for applied wisdom or regional
            accuracy.
          </p>
          <p>
            <strong>That's why we built Weval:</strong> an open, collaborative platform to build
            evaluations that test what matters to you. We empower a global
            community to create qualitative benchmarks for any domain—from
            medical chatbots to legal assistance. Just as Wikipedia democratized
            knowledge, Weval aims to democratize evaluation, ensuring that AI
            works for, and represents, everyone.
          </p>
          <p><strong>What you can do on Weval:</strong></p>
          <ul className="list-disc list-outside pl-5 space-y-2">
            <li>
              <strong>Publish a benchmark.</strong> Provide a blueprint that describes the task,
              the rubric, and the models to test. Weval runs the evaluation and
              returns reproducible scores.
            </li>
            <li>
              <strong>Consult the library.</strong> Browse a public leaderboard of community
              benchmarks on domains such as clinical advice, legal reasoning,
              regional knowledge, and AI safety. Each benchmark re‑runs
              automatically to detect performance drift.
            </li>
          </ul>
          <p><strong>How the platform works</strong></p>
          <ul className="list-disc list-outside pl-5 space-y-2">
            <li>
              <strong>Prompt & rubric.</strong> You develop a prompt for the model, and then
              describe what a good answer should (and should not) contain.
            </li>
            <li>
              <strong>Scoring.</strong> Weval combines rubric‑based judgments from “judge”
              language models with semantic‑similarity metrics to produce
              transparent 0‑1 scores.
            </li>
            <li>
              <strong>Continuous runs.</strong> Benchmarks are re‑executed on schedule or when
              models update, and results stay visible in an interactive
              dashboard.
            </li>
          </ul>
        </section>

        <section aria-labelledby="why-weval-matters-heading" className="md:w-1/3 mt-6 md:mt-0">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4 md:gap-5">
            <div className="bg-card/40 dark:bg-card/40 backdrop-blur-sm p-4 rounded-lg shadow-md ring-1 ring-border/50 dark:ring-border/50 flex flex-col h-full">
              <p className="text-sm text-foreground/80 dark:text-muted-foreground leading-relaxed flex-grow">
                All our tests, data, and code are open-source. We invite public scrutiny and contributions. You can add your own evaluation blueprints to <a href="https://weval.org" className="text-highlight-success dark:text-highlight-success hover:underline">weval.org</a> itself, or even ship your own version of Weval for the domain of your choice.
              </p>
              <div className="mt-2 pt-3 border-t border-border/30 dark:border-border/30 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <a
                  href={APP_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-highlight-success text-sm font-medium rounded-md text-highlight-success hover:bg-highlight-success/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-highlight-success dark:ring-offset-background transition-colors"
                >
                  View App on GitHub
                </a>
                <a
                  href={BLUEPRINT_CONFIG_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md text-highlight-success-foreground bg-highlight-success hover:bg-highlight-success/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-highlight-success dark:ring-offset-background transition-colors shadow-sm hover:shadow-md"
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

