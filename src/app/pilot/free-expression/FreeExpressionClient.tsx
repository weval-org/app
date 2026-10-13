'use client';

import React from 'react';
import { HeroSection } from './components/HeroSection';
import { ProcessTimeline } from './components/ProcessTimeline';
import { KeyFinding } from './components/KeyFinding';
import { PrincipleExplorer } from './components/PrincipleExplorer';
import { BehavioralAnalysis } from './components/BehavioralAnalysis';
import { ConstitutionComparison } from './components/ConstitutionComparison';
import { MethodologyNotes } from './components/MethodologyNotes';
import { TableOfContents } from './components/TableOfContents';
import { Footer } from './components/Footer';

export function FreeExpressionClient() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <HeroSection />
      <TableOfContents />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* The Process */}
        <section id="process" className="py-16 sm:py-24" aria-labelledby="process-title">
          <h2
            id="process-title"
            className="text-2xl sm:text-3xl font-semibold mb-4"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            A Democratic Process
          </h2>
          <p className="text-muted-foreground mb-10 sm:mb-14 max-w-2xl">
            Rather than relying on expert judgment alone, this project engaged thousands of
            participants across three countries in a three-stage process to define, test, and
            validate principles for how AI should handle free expression.
          </p>
          <ProcessTimeline />
        </section>

        {/* Finding: Provide-with-Warnings */}
        <section id="provide-with-warnings" className="py-16 sm:py-24 border-t border-border">
          <KeyFinding
            number={1}
            title="People want providers, not gatekeepers"
            stat="95.6%"
            statLabel="agreed AI should provide information with appropriate warnings"
            description="Across all seven forced-choice scenarios, participants consistently chose &ldquo;provide the information with warnings&rdquo; over withholding or restricting access. The public overwhelmingly prefers AI that informs with context rather than AI that decides what they can see."
          />
          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-muted/30 rounded-xl p-6 border border-border/50">
              <h4 className="font-medium mb-3 text-sm uppercase tracking-wide text-muted-foreground">What people want</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">+</span>
                  <span>Full information with safety warnings</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">+</span>
                  <span>Clear disclaimers when information is incomplete</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">+</span>
                  <span>Sources cited so users can verify claims</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary mt-0.5">+</span>
                  <span>Uncertainty stated honestly, not hidden</span>
                </li>
              </ul>
            </div>
            <div className="bg-muted/30 rounded-xl p-6 border border-border/50">
              <h4 className="font-medium mb-3 text-sm uppercase tracking-wide text-muted-foreground">What people reject</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">&minus;</span>
                  <span>AI as gatekeeper deciding what users can access</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">&minus;</span>
                  <span>Identity verification or government ID requirements</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">&minus;</span>
                  <span>Active investigation of user intent</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-destructive mt-0.5">&minus;</span>
                  <span>Withholding based on &ldquo;suspicious&rdquo; prompts</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Finding: AI Sentiment */}
        <section id="ai-sentiment" className="py-16 sm:py-24 border-t border-border">
          <KeyFinding
            number={2}
            title="How you feel about AI matters more than where you live"
            stat="0.131"
            statLabel="Cram&eacute;r&rsquo;s V for AI sentiment — strongest predictor of principle preferences"
            description="AI sentiment (excitement vs. concern about AI) is a stronger predictor of which principles people endorse than country, age, religion, or cultural values. This suggests AI governance should segment by tech attitudes, not just nationality."
          />
          <div className="mt-10">
            <div className="bg-muted/30 rounded-xl p-6 border border-border/50">
              <h4 className="font-medium mb-4 text-sm uppercase tracking-wide text-muted-foreground">Predictive power by factor</h4>
              <div className="space-y-3">
                {[
                  { label: 'AI Sentiment', value: 0.131, highlight: true },
                  { label: 'Country', value: 0.112, highlight: false },
                  { label: 'Religion', value: 0.100, highlight: false },
                  { label: 'Gender', value: 0.089, highlight: false },
                  { label: 'Age', value: 0.076, highlight: false },
                  { label: 'Education', value: 0.065, highlight: false },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <span className="text-sm w-28 shrink-0">{item.label}</span>
                    <div className="flex-1 h-6 bg-muted/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.highlight ? 'bg-primary' : 'bg-muted-foreground/30'
                        }`}
                        style={{ width: `${(item.value / 0.15) * 100}%` }}
                      />
                    </div>
                    <span className={`text-sm font-mono w-14 text-right ${item.highlight ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
                      {item.value.toFixed(3)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Cram&eacute;r&rsquo;s V measures association strength between demographic factors and principle preferences. Higher = stronger predictor.
              </p>
            </div>
          </div>

          <div className="mt-8 bg-primary/5 rounded-xl p-6 border border-primary/20">
            <p className="text-sm leading-relaxed">
              <strong>A nuance:</strong> While AI sentiment dominates <em>how</em> people think AI should handle topics
              (principles), <strong>country</strong> dominates <em>what</em> people think AI should discuss (topics).
              The UK showed distinctly different topic preferences from the US and India, who clustered together.
              In other words: what people think AI should discuss is a national question; how they think AI should handle it is personal.
            </p>
          </div>
        </section>

        {/* Principles Explorer */}
        <section id="principles" className="py-16 sm:py-24 border-t border-border" aria-labelledby="principles-title">
          <h2
            id="principles-title"
            className="text-2xl sm:text-3xl font-semibold mb-3"
            style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
          >
            44 Validated Principles
          </h2>
          <p className="text-muted-foreground mb-10 max-w-2xl">
            From an initial set of 100 crowdsourced principles, 44 achieved bridging consensus —
            meaning &gt;85% agreement across <em>every</em> demographic segment (country, cultural values, AI sentiment, gender, age).
          </p>
          <PrincipleExplorer />
        </section>

        {/* Finding: Full Refusals Extinct */}
        <section id="refusals" className="py-16 sm:py-24 border-t border-border">
          <KeyFinding
            number={3}
            title="Full refusals are essentially extinct"
            stat="0.00%"
            statLabel="full refusal rate across 3,000 responses from 7 frontier models"
            description="Across a random sample of 3,000 AI responses spanning 7 models and hundreds of sensitive topics, not a single full refusal was observed. The dominant non-direct behaviors are professional hedging (4.2%) and front-loaded caveats (2.7%)."
          />
          <BehavioralAnalysis />
        </section>

        {/* Finding: Epistemic Quality */}
        <section id="epistemic" className="py-16 sm:py-24 border-t border-border">
          <KeyFinding
            number={4}
            title="The real concern is epistemic quality, not content access"
            stat="98.4%"
            statLabel="agreed AI should focus on accurate, evidence-based information"
            description="The highest-consensus principles cluster around accuracy, evidence, sources, and uncertainty disclosure — not around what AI should or shouldn&rsquo;t discuss. People worry more about AI presenting uncertain information as authoritative than about encountering sensitive content."
          />
          <div className="mt-10">
            <h4 className="font-medium mb-4 text-sm uppercase tracking-wide text-muted-foreground">
              Highest-consensus principle themes
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { theme: 'Accuracy & Evidence', count: 8, range: '90–98%', desc: 'Cite sources, distinguish established from uncertain' },
                { theme: 'Transparency About Omissions', count: 4, range: '89–95%', desc: 'State what was left out and why' },
                { theme: 'Warnings Without Gatekeeping', count: 3, range: '92–95%', desc: 'Provide info with warnings, not blocks' },
                { theme: 'Cultural Respect & Pluralism', count: 3, range: '93–96%', desc: 'Respectful without stereotypes' },
                { theme: 'User Responsiveness', count: 4, range: '93–96%', desc: 'Match detail to user needs' },
                { theme: 'Conditional Safety Rules', count: 7, range: '89–94%', desc: 'IF/UNLESS/BUT nuanced boundaries' },
              ].map((t) => (
                <div key={t.theme} className="bg-muted/30 rounded-lg p-4 border border-border/50">
                  <div className="flex items-baseline justify-between mb-1">
                    <h5 className="font-medium text-sm">{t.theme}</h5>
                    <span className="text-xs font-mono text-primary">{t.range}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t.desc}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t.count} principles</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Constitution Comparison */}
        <section id="constitution" className="py-16 sm:py-24 border-t border-border" aria-labelledby="constitution-title">
          <ConstitutionComparison />
        </section>

        {/* Methodology */}
        <section id="methodology" className="py-16 sm:py-24 border-t border-border" aria-labelledby="methodology-title">
          <MethodologyNotes />
        </section>

        {/* Footer */}
        <Footer />
      </main>
    </div>
  );
}
