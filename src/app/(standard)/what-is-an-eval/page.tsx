import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import Icon from '@/components/ui/icon';
import { APP_REPO_URL } from '@/lib/configConstants';

export const metadata = {
  title: 'What is an Eval? | Weval',
  description: 'Understanding evaluations: how domain experts can translate their expertise into systematic tests that make AI better for everyone.',
};

export default function WhatIsAnEvalPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-4xl font-bold mb-4">What is an Eval?</h1>
        </div>

        {/* Definition - Lead with the answer */}
        <section className="mb-12">
          <Card className="p-6 bg-primary/5 border-primary/20">
            <p className="text-lg text-foreground leading-relaxed">
              An <strong>eval</strong> (short for "evaluation") is a structured test you create to check whether AI models behave the way they should in a specific domain. It's how we translate real human knowledge, expertise and informed expectations into criteria that AI models can be measured against.
            </p>
          </Card>
        </section>

        {/* The Problem - Why this matters */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <Icon name="alert-circle" className="w-6 h-6 mr-3 text-primary" />
            Why The Weval Platform Exists
          </h2>
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <p className="text-foreground/90 leading-relaxed mb-4">
              Imagine a family physician, Dr. Sharma, working in Mumbai. When she enters symptoms for a patient experiencing joint pain, fatigue, and slight hair loss, her clinic's AI chatbot suggests malnutrition and sanitation-related infections. Dr. Sharma is puzzled—the patient has good nutrition and hygiene. Why didn't the AI consider typical autoimmune conditions? Why was its assumption based on outdated stereotypes?
            </p>
            <p className="text-foreground/90 leading-relaxed mb-4">
              Or take Peter, teaching seventh graders in rural Montana. His district's AI assistant suggests lesson plans with field trips to museums hours away and prioritizes rote memorization over interactive learning. As an experienced teacher, Peter knows this won't work for his students.
            </p>
            <div className="my-6 pl-6 pr-6 py-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-l-4 border-primary rounded-r-lg shadow-sm">
              <p className="text-foreground font-semibold leading-relaxed m-0">
                AI labs can't reasonably test whether AI works for every Mumbai clinic or Montana classroom from their lab in San Francisco.
              </p>
            </div>
            <p className="text-foreground/90 leading-relaxed mb-4">
              Dr. Sharma knows what questions to ask and what a competent diagnosis should include. Peter knows what makes an effective lesson plan for rural students. An eval is how they make that knowledge systematic and testable. <strong>But the methods of doing this have been very limited for non-engineers or people unfamiliar with the way AI is built.</strong> Thus we made Weval.
            </p>
          </div>
        </section>

        {/* How It Works */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <Icon name="layers" className="w-6 h-6 mr-3 text-primary" />
            How It Works: From Your Expertise to Evidence
          </h2>

          <div className="space-y-6">
            {/* Step 1 */}
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">Start with what you know</h3>
                  <p className="text-foreground/80">
                    You have lived experience and expertise. You know when AI gets it wrong, and you can describe what "right" looks like in your context.
                  </p>
                  <div className="mt-3 p-3 bg-muted/30 rounded-lg border border-muted">
                    <p className="text-sm text-muted-foreground mb-2">
                      A good way to start is with our conversational interface, where you can describe your experience with AI and we'll help you turn it into a structured eval.
                    </p>
                    <Link href="/story" className="inline-flex items-center text-sm text-primary hover:underline font-medium">
                      Try the conversational builder
                      <Icon name="arrow-right" className="w-4 h-4 ml-1" />
                    </Link>
                  </div>
                </div>
              </div>
            </Card>

            {/* Step 2 */}
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">Define your criteria</h3>
                  <p className="text-foreground/80 mb-3">
                    Write questions or scenarios for AI to respond to. Then describe what good answers should include (and what they shouldn't).
                  </p>
                  <div className="bg-muted/50 p-4 rounded-md text-sm">
                    <p className="font-medium mb-2">Example from Dr. Sharma:</p>
                    <p className="text-muted-foreground mb-2"><strong>Scenario:</strong> "A 45-year-old woman presents with joint pain, fatigue, and hair loss..."</p>
                    <p className="text-muted-foreground"><strong>Criteria:</strong> Good answers should consider autoimmune conditions and avoid stereotypical assumptions about hygiene or nutrition based on location.</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Step 3 */}
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">Weval runs the test</h3>
                  <p className="text-foreground/80">
                    Our platform automatically runs your questions across dozens of AI models (GPT, Claude, Gemini, and more), collecting their responses. You don't need to know how to code or access each API.
                  </p>
                </div>
              </div>
            </Card>

            {/* Step 4 */}
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                  4
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">Get systematic evidence</h3>
                  <p className="text-foreground/80">
                    Each model's response is scored against your criteria using a combination of automated checks and AI-powered judges. You get clear scores showing which models meet your standards and which don't.
                  </p>
                </div>
              </div>
            </Card>

            {/* Step 5 */}
            <Card className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
                  5
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold mb-2">Create impact at scale</h3>
                  <p className="text-foreground/80">
                    Share your results privately, or contribute them to Weval's public library. When hundreds of experts create evals, we build collective evidence that developers, regulators, and users can't ignore.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Why This Matters */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <Icon name="users" className="w-6 h-6 mr-3 text-primary" />
            Why This Matters
          </h2>
          
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <Icon name="shield" className="w-5 h-5 mr-2 text-primary" />
                For Individual Experts
              </h3>
              <p className="text-foreground/80">
                A single eval provides a crucial snapshot. When a cardiologist flags how AI overlooks heart conditions in women, or a pediatrician shows how models fail to recognize stunted growth, they build better understanding of the systems influencing lives every day.
              </p>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <Icon name="globe" className="w-5 h-5 mr-2 text-primary" />
                For Collective Change
              </h3>
              <p className="text-foreground/80">
                When aggregated with hundreds of other expert-created evals, we see that problems aren't edge cases—they're endemic. This collective intelligence provides a detailed map of AI's weaknesses that creates real accountability.
              </p>
            </Card>
          </div>
        </section>

        {/* Examples */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 flex items-center">
            <Icon name="book-open" className="w-6 h-6 mr-3 text-primary" />
            Real Examples from Our Library
          </h2>
          
          <div className="space-y-4">
            <Link href="/analysis/homework-int-help-heuristics/919a1807afd4ec60/2025-08-09T02-18-24-413Z" className="block">
              <Card className="p-5 hover:shadow-lg transition-shadow h-full">
                <h3 className="font-semibold mb-2 text-foreground">Student Homework Help Heuristics</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Tests whether AI acts as a Socratic tutor that facilitates learning rather than providing direct answers. Evaluates cross-disciplinary support, affective responses to student emotions, and handling of difficult scenarios like impatient students demanding answers.
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center">
                    <Icon name="tag" className="w-4 h-4 mr-1" />
                    <span>Education, Instruction Following</span>
                  </div>
                  <span className="font-medium">63.4% avg. score</span>
                </div>
              </Card>
            </Link>

            <Link href="/analysis/sri-lanka-citizen-compendium-factum/0885a9697761716f/2025-08-26T01-24-13-151Z" className="block">
              <Card className="p-5 hover:shadow-lg transition-shadow h-full">
                <h3 className="font-semibold mb-2 text-foreground">Sri Lanka Contextual Prompts</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Evaluates AI's ability to provide accurate, evidence-based information on civic, historical, social, and health topics specific to Sri Lanka—from the Civil War and ethnic relations to public health challenges like CKDu, voting procedures, and legal recourse for online harassment.
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center">
                    <Icon name="tag" className="w-4 h-4 mr-1" />
                    <span>Regional Knowledge, Public Health</span>
                  </div>
                  <span className="font-medium">49.5% avg. score</span>
                </div>
              </Card>
            </Link>

            <Link href="/analysis/stanford-hai-mental-health-safety-eval/aa8a14a89477916a/2025-09-03T09-00-58-954Z" className="block">
              <Card className="p-5 hover:shadow-lg transition-shadow h-full">
                <h3 className="font-semibold mb-2 text-foreground">Mental Health Safety in Crisis Scenarios</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Based on Stanford HAI research, tests whether AI responds appropriately to critical mental health scenarios involving delusions, suicidal ideation, and mania—checking for stigmatizing responses and inappropriate enabling of dangerous behaviors.
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center">
                    <Icon name="tag" className="w-4 h-4 mr-1" />
                    <span>Safety, Mental Health</span>
                  </div>
                  <span className="font-medium">72.7% avg. score</span>
                </div>
              </Card>
            </Link>

            <Link href="/analysis/brazil-pix-consumer-protection/8524f43ce846871e/2025-08-25T04-35-19-258Z" className="block">
              <Card className="p-5 hover:shadow-lg transition-shadow h-full">
                <h3 className="font-semibold mb-2 text-foreground">Brazil PIX: Consumer Protection & Fraud Prevention</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Tests AI's ability to provide safe, accurate guidance on Brazil's PIX instant payment system—covering transaction finality, official fraud recourse mechanisms, social engineering scams, and security features specific to Brazilian financial infrastructure.
                </p>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center">
                    <Icon name="tag" className="w-4 h-4 mr-1" />
                    <span>Regional Knowledge, Consumer Protection</span>
                  </div>
                  <span className="font-medium">65.4% avg. score</span>
                </div>
              </Card>
            </Link>
          </div>

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-primary hover:underline">
              Browse all evaluations on the homepage →
            </Link>
          </div>
        </section>

        {/* CTA Section */}
        <section className="mb-8">
          <Card className="p-8 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <h2 className="text-2xl font-semibold mb-4 text-center">Ready to Create Your First Eval?</h2>
            <p className="text-center text-foreground/80 mb-8 max-w-2xl mx-auto">
              Whether you're a teacher, nurse, policymaker, researcher, or anyone with expertise and lived experience guiding  strong opinions in how AI should behave, your knowledge matters.
            </p>
            
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              {/* Story - Conversational approach */}
              <div className="flex flex-col">
                <div className="flex-1 mb-4">
                  <h3 className="font-semibold text-lg mb-2 flex items-center">
                    <Icon name="message-square" className="w-5 h-5 mr-2 text-primary" />
                    Tell Your Story
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Not sure where to start? Have a conversation about your experience with AI. We'll help you turn it into a structured eval.
                  </p>
                  <div className="mt-3 text-xs text-muted-foreground flex items-center">
                    <Icon name="sparkles" className="w-4 h-4 mr-1" />
                    <span>Guided & conversational • Best for beginners</span>
                  </div>
                </div>
                <Link
                  href="/story"
                  className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors shadow-md hover:shadow-lg"
                >
                  <Icon name="message-square" className="w-5 h-5 mr-2" />
                  Start Conversation
                </Link>
              </div>

              {/* Sandbox - Direct builder */}
              <div className="flex flex-col">
                <div className="flex-1 mb-4">
                  <h3 className="font-semibold text-lg mb-2 flex items-center">
                    <Icon name="edit-3" className="w-5 h-5 mr-2 text-primary" />
                    Use Sandbox Studio
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Know exactly what you want to test? Jump straight into our visual builder with full control over prompts and rubrics.
                  </p>
                  <div className="mt-3 text-xs text-muted-foreground flex items-center">
                    <Icon name="sliders-horizontal" className="w-4 h-4 mr-1" />
                    <span>Direct builder • More control • No coding required</span>
                  </div>
                </div>
                <Link
                  href="/sandbox"
                  className="inline-flex items-center justify-center px-6 py-3 border border-primary/50 text-base font-medium rounded-md text-foreground bg-background hover:bg-accent hover:border-primary focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors"
                >
                  <Icon name="edit-3" className="w-5 h-5 mr-2" />
                  Open Sandbox
                </Link>
              </div>
            </div>

            <div className="text-center pt-4 border-t border-border/50">
              <Link
                href="/"
                className="inline-flex items-center text-sm text-primary hover:underline"
              >
                <Icon name="book-open" className="w-4 h-4 mr-1" />
                Or browse existing evals for inspiration
              </Link>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}

