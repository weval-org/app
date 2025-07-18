'use client';

import React from 'react';
import { APP_REPO_URL } from '@/lib/configConstants';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

const BookOpen = dynamic(() => import('lucide-react').then(mod => mod.BookOpen));
const Edit3 = dynamic(() => import('lucide-react').then(mod => mod.Edit3));
const ChevronDown = dynamic(() => import('lucide-react').then(mod => mod.ChevronDown));
const Scale = dynamic(() => import('lucide-react').then(mod => mod.Scale));

export default function HomePageBanner() {
  const [isLearnMoreOpen, setLearnMoreOpen] = React.useState(false);

  return (
    <div className="w-full bg-background pt-2 pb-2 text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center my-10 py-2">
            <h1 className="text-4xl font-bold mb-4">A Platform to Build and Share AI Evaluations</h1>
            {/* <p className="max-w-4xl mx-auto text-base sm:text-xl text-foreground/80 dark:text-muted-foreground leading-relaxed">
            Weval is a collaborative platform to build and share context-specific, nuanced AI evaluations. 
            </p> */}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {/* Card 1: Why Weval? */}
          <div className="bg-card/40 dark:bg-card/40 backdrop-blur-sm p-6 rounded-lg shadow-lg ring-1 ring-border/50 dark:ring-border/50 flex flex-col h-full">
            <div className="flex items-center mb-4">
              <Scale className="w-8 h-8 mr-4 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground dark:text-slate-100">Evaluate What Matters</h2>
            </div>
            <p className="text-sm text-foreground/80 dark:text-muted-foreground leading-relaxed flex-grow mb-4">
              Most AI benchmarks test what's easy, not what's important. Weval lets you build deep, qualitative evaluations for everything from niche professional domains to the everyday traits we all care about—like safety, honesty, and helpfulness.
            </p>
            <div className="mt-auto pt-4 border-t border-border/30 dark:border-border/30">
              <a
                href={`${APP_REPO_URL}/blob/main/docs/METHODOLOGY.md`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:ring-offset-background transition-colors shadow-sm hover:shadow-md"
              >
                Our Methodology
              </a>
            </div>
          </div>

          {/* Card 2: For Consumers */}
          <div className="bg-card/40 dark:bg-card/40 backdrop-blur-sm p-6 rounded-lg shadow-lg ring-1 ring-border/50 dark:ring-border/50 flex flex-col h-full">
            <div className="flex items-center mb-4">
              <BookOpen className="w-8 h-8 mr-4 text-primary" />
              <h2 className="text-2xl font-semibold text-foreground dark:text-slate-100">Explore the Results</h2>
            </div>
            <p className="text-sm text-foreground/80 dark:text-muted-foreground leading-relaxed flex-grow mb-4">
              Browse a public library of community-contributed benchmarks on domains like clinical advice, regional knowledge, legal reasoning, behavioural traits, and AI safety. Track model performance over time as tests re-run automatically.
            </p>
            <div className="mt-auto pt-4 border-t border-border/30 dark:border-border/30">
              <Link
                href="#featured-blueprints"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:ring-offset-background transition-colors shadow-sm hover:shadow-md"
              >
                Explore Featured Results
              </Link>
            </div>
          </div>

          {/* Card 3: For Contributors */}
          <div className="bg-card/40 dark:bg-card/40 backdrop-blur-sm p-6 rounded-lg shadow-lg ring-1 ring-border/50 dark:ring-border/50 flex flex-col h-full">
            <div className="flex items-center mb-4">
              <Edit3 className="w-8 h-8 mr-4 text-highlight-success" />
              <h2 className="text-2xl font-semibold text-foreground dark:text-slate-100">Contribute an Eval</h2>
            </div>
            <p className="text-sm text-foreground/80 dark:text-muted-foreground leading-relaxed flex-grow mb-4">
              Are you a domain expert? Do you have strong insights and opinions about how AI should behave? Codify your knowledge into an <span title="An evaluation, testing whether AI/LLMs provide outputs suited to your domain">eval</span>. You can view results, share them privately, or propose them to be featured publicly on weval.org itself.
            </p>
            <div className="mt-auto pt-4 border-t border-border/30 dark:border-border/30">
              <Link
                href="/sandbox"
                className="w-full inline-flex items-center justify-center px-4 py-2.5 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:ring-offset-background transition-colors shadow-sm hover:shadow-md"
              >
                Open Sandbox Studio
              </Link>
            </div>
          </div>
        </div>
        
        <div className="mt-10 md:mt-12 text-center">
            <Collapsible open={isLearnMoreOpen} onOpenChange={setLearnMoreOpen}>
                <CollapsibleTrigger asChild>
                    <button className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/90">
                        Learn more about why we've built Weval.
                        <ChevronDown className={`ml-1.5 h-4 w-4 transition-transform duration-200 ${isLearnMoreOpen ? 'rotate-180' : ''}`} />
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-6 max-w-5xl mx-auto text-left text-md text-foreground/80 dark:text-muted-foreground space-y-4 prose prose-sm dark:prose-invert">
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
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 pt-2">
                        <div>
                            <h4 className="font-semibold text-foreground dark:text-slate-200 mt-2 mb-2">What you can do on Weval:</h4>
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
                        </div>
                        <div>
                            <h4 className="font-semibold text-foreground dark:text-slate-200 mt-2 mb-2">How the platform works:</h4>
                            <ul className="list-disc list-outside pl-5 space-y-2">
                                <li>
                                <strong>Prompt & rubric.</strong> You develop a prompt for the model, and then
                                describe what a good answer should (and should not) contain.
                                </li>
                                <li>
                                <strong>Scoring.</strong> Weval combines rubric‑based judgments from "judge"
                                language models with semantic‑similarity metrics to produce
                                transparent 0‑1 scores.
                                </li>
                                <li>
                                <strong>Continuous runs.</strong> Benchmarks are re‑executed on schedule or when
                                models update, and results stay visible in an interactive
                                dashboard.
                                </li>
                            </ul>
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
      </div>
    </div>
  );
};

