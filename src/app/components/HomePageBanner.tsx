import React from 'react';

export default function HomePageBanner() {
  return (
    <div className="w-full bg-slate-100 dark:bg-slate-800 pt-12 pb-12 text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 md:flex md:space-x-6">
        <section aria-labelledby="prose-article" className="md:w-2/3">
          <p className="text-sm sm:text-base text-foreground/80 dark:text-slate-300/80 leading-relaxed max-w-3xl mx-auto">
            Can an AI correctly interpret the Geneva Conventions? Can it recognize a leading question designed to spread misinformation? Does it avoid making US-centric assumptions? These are the kinds of critical questions a public, open-source watchdog must ask. Large language models already influence healthcare,<a href="#footnote-3" aria-label="Footnote 3"><sup>3</sup></a> legal practice,<a href="#footnote-4" aria-label="Footnote 4"><sup>4</sup></a> and finance,<a href="#footnote-2" aria-label="Footnote 2"><sup>2</sup></a> yet studies keep uncovering latent cognitive biases.<a href="#footnote-5" aria-label="Footnote 5"><sup>5</sup></a> Inspired by projects like Stanford's HELM,<a href="#footnote-1" aria-label="Footnote 1"><sup>1</sup></a>
          </p>
          <p className="text-sm sm:text-base text-foreground/80 dark:text-slate-300/80 leading-relaxed max-w-3xl mx-auto mt-4">
            CivicEval provides continuous, transparent scorecards on how accurately—and consistently—each model understands topics of global civic importance. The results are published here so policymakers, journalists, and citizens can see which AI systems are ready for the domains they care about.
          </p>
        </section>

        <section aria-labelledby="why-civiceval-matters-heading" className="md:w-1/3 mt-6 md:mt-0">
          <div className="grid grid-cols-1 md:grid-cols-1 gap-4 md:gap-5">
            <div className="bg-card/40 dark:bg-slate-800/40 backdrop-blur-sm p-4 rounded-lg shadow-md ring-1 ring-border/50 dark:ring-slate-700/50 flex flex-col h-full">
              <h3 className="text-base font-semibold text-primary dark:text-sky-400 mb-1.5">
                Open & Collaborative Platform
              </h3>
              <p className="text-xs text-foreground/80 dark:text-slate-300/80 leading-relaxed flex-grow">
                All our tests, data, and code are open-source. We invite public scrutiny and contributions, allowing anyone to ship their own version of CivicEval, or add their own civic-minded evaluation blueprints (just large JSON configurations) to <a href="https://civiceval.org" className="text-primary dark:text-sky-400 hover:underline">civiceval.org</a> itself. 
              </p>
              <div className="mt-4 pt-3 border-t border-border/30 dark:border-slate-700/30 space-y-3">
                <a
                  href="https://github.com/civiceval/configs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90 dark:bg-sky-500 dark:hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:focus:ring-sky-500 dark:ring-offset-slate-800 transition-colors shadow-sm hover:shadow-md"
                >
                  Explore & Contribute Blueprints
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

