import React from 'react';
import { BLUEPRINT_CONFIG_REPO_URL, APP_REPO_URL } from '@/lib/configConstants';

export default function HomePageBanner() {
  return (
    <div className="w-full bg-background pt-6 pb-2 text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 md:flex md:space-x-6">
        <section aria-labelledby="prose-article" className="md:w-2/3">
          <p className="text-sm sm:text-base text-foreground/80 dark:text-slate-300/80 leading-relaxed max-w-3xl mx-auto">
            Current AI evaluations measure what's easy, not what's important. Benchmarks that rely on multiple-choice questions or simple pass/fail tests can't capture the nuance of real-world tasks. They can tell you if code <em>runs</em>, but not if it's well-written. They can test for textbook knowledge, but not for applied wisdom or safety.
          </p>
          <p className="text-sm sm:text-base text-foreground/80 dark:text-slate-300/80 leading-relaxed max-w-3xl mx-auto mt-4">
            <strong>Weval</strong> is our answer. It's an open, collaborative platform to build evaluations that test what truly matters. We empower a global community to create rich, qualitative benchmarks for any domain—from the safety of a medical chatbot to the quality of a legal summary. Just as Wikipedia democratized knowledge, Weval aims to democratize scrutiny, ensuring that AI works for, and represents, everyone.
          </p>
        </section>

        <section aria-labelledby="why-weval-matters-heading" className="md:w-1/3 mt-6 md:mt-0">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4 md:gap-5">
            <div className="bg-card/40 dark:bg-slate-800/40 backdrop-blur-sm p-4 rounded-lg shadow-md ring-1 ring-border/50 dark:ring-slate-700/50 flex flex-col h-full">
              <p className="text-sm text-foreground/80 dark:text-slate-300/80 leading-relaxed flex-grow">
                Our code is open-source. And all evaluation blueprints are public domain, easy for you to scrutizine and constribute to. You can add your own blueprints to <a href="https://weval.org" className="text-highlight-success dark:text-highlight-success hover:underline">weval.org</a> itself, or even ship your own version of Weval for the niche of your choice, private or public.
              </p>
              <div className="mt-2 pt-3 border-t border-border/30 dark:border-slate-700/30 grid grid-cols-1 sm:grid-cols-2 gap-3">
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

