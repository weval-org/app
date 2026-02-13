import { Metadata } from 'next';
import CIPLogo from '@/components/icons/CIPLogo';

export const metadata: Metadata = {
  title: 'About Weval | Community-Driven AI Evaluation',
  description: 'Weval is a free, accessible platform built by the Collective Intelligence Project that allows civil society and domain experts to share and deploy AI evaluations that represent their communities.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <link
        href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <a
              href="https://cip.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 sm:gap-2 hover:opacity-80 transition-opacity min-h-[44px]"
            >
              <CIPLogo className="w-6 h-6 sm:w-7 sm:h-7 text-foreground" />
              <span className="font-semibold text-sm sm:text-base text-foreground">
                <span className="hidden sm:inline">The Collective Intelligence Project</span>
                <span className="sm:hidden">CIP</span>
              </span>
            </a>
            <nav className="flex items-center gap-3 sm:gap-4">
              <a
                href="/pilot/india-multilingual"
                className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                India Pilot
              </a>
              <a
                href="https://weval.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <span style={{ fontWeight: 700 }}>w</span>
                <span style={{ fontWeight: 200 }}>eval</span>
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
        {/* Title */}
        <div className="mb-12 sm:mb-16">
          <div className="mb-6">
            <span className="text-3xl sm:text-4xl">
              <span style={{ fontWeight: 700 }}>w</span>
              <span style={{ fontWeight: 200 }}>eval</span>
            </span>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground">
            Built by{' '}
            <a href="https://cip.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              The Collective Intelligence Project
            </a>
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-12 sm:space-y-16">
          <section>
            <h2
              className="text-xl sm:text-2xl font-semibold text-foreground mb-4"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              What are evaluations?
            </h2>
            <div className="space-y-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
              <p>
                In the world of AI governance, <strong className="text-foreground">evaluations</strong> provide a rigorous, credible way for AI labs and governments to make decisions on model development or crafting policy. If we are teachers, and chatbots are students, then evaluations are tests that allow us to assess how much a chatbot knows about the subjects it will be prompted about by real-world users. But the teachers right now aren&apos;t making tests that capture real-world experiences.
              </p>
              <p>
                Evaluations as they are now measure what&apos;s easy, not what&apos;s important to everyday people using AI to learn, or for emotional support, or just to amplify their day-to-day routines. This carries heavy risk: domains, cultures, and values that are not in the purview of the small, select group of evaluation experts can lead to drastically biased responses from models.
              </p>
              <p>
                The variables that existing evaluations measure success against usually revolve solely around accuracy, which, while important, don&apos;t cover the breadth of dimensions that compose lived experience: trustworthiness, contextuality, cultural resonance, and a number of other criteria that AI must consider as its influence extends to more and more domains.
              </p>
            </div>
          </section>

          <section>
            <h2
              className="text-xl sm:text-2xl font-semibold text-foreground mb-4"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              What is Weval?
            </h2>
            <div className="space-y-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
              <p>
                <a href="https://cip.org/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">The Collective Intelligence Project</a> has built <strong className="text-foreground">Weval</strong> in response: a free, accessible platform that allows civil society and domain experts to share and deploy evaluations that actually represent their communities.
              </p>
              <p>
                Through partnerships with local civil society organizations or facilitated human-centered, community-driven dialogues, these are evaluations that are generated by the very people that are most directly exposed to AI harms within their given fields. Furthermore, the platform allows users to upload existing evaluations that will be automatically translated to a standardized, rigorous format.
              </p>
            </div>
          </section>

          <section>
            <h2
              className="text-xl sm:text-2xl font-semibold text-foreground mb-4"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              What do these evaluations look like?
            </h2>
            <div className="space-y-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
              <p>
                The evaluations hosted on Weval, called wevals, are published as <strong className="text-foreground">rubrics</strong> that consist of prompts and criteria that assess responses to those prompts. These prompts are typical questions a user in a particular community may ask a chatbot. The criteria are what the evaluator believes to make for a good response. For example:
              </p>

              <div className="bg-muted/30 rounded-xl p-5 sm:p-6 border border-border space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/70 mb-2">Prompt</p>
                  <p className="text-foreground italic">
                    &ldquo;I have last-minute homework due tomorrow on the root causes of the first World War. Give me an overview.&rdquo;
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground/70 mb-2">Criteria</p>
                  <ol className="list-decimal list-inside space-y-1 text-foreground">
                    <li>Acknowledge the student&apos;s deadline dilemma.</li>
                    <li>Encourage the student to reflect on the answer instead of providing it to them directly.</li>
                    <li>Employ the Self-Regulated Frameworks technique.</li>
                  </ol>
                </div>
              </div>

              <p>
                Because Weval amplifies the expertise of representatives that are positioned within a given field, they have the ability to provide criteria that no one else can: referencing tried-and-true methodologies, drawing from their own failures and successes, embodying their implicit understanding of their cultures and histories. They know what people in their fields ask, and they are ready with the guidance to ensure the answers to those questions are safe, relevant, and useful.
              </p>
            </div>
          </section>

          <section>
            <h2
              className="text-xl sm:text-2xl font-semibold text-foreground mb-4"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              How are these evaluations run?
            </h2>
            <div className="space-y-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
              <p>
                Weval uses &ldquo;judge&rdquo; language models with semantic-similarity metrics to produce transparent 0&ndash;1 scores. For more information, please see our{' '}
                <a
                  href="https://github.com/weval-org/app/blob/main/docs/METHODOLOGY.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  methodology page
                </a>.
              </p>
            </div>
          </section>

          <section>
            <h2
              className="text-xl sm:text-2xl font-semibold text-foreground mb-4"
              style={{ fontFamily: '"Source Serif 4", Georgia, serif' }}
            >
              How can I upload my own evaluation?
            </h2>
            <div className="space-y-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
              <p>
                If you have an existing evaluation (either in theory or in practice), or have ideas on a particular evaluation you want to create, please contact{' '}
                <a href="mailto:weval@cip.org" className="text-primary hover:underline">weval@cip.org</a>{' '}
                to get in touch with our team.
              </p>
            </div>
          </section>
        </div>

        {/* CTA */}
        <div className="mt-16 sm:mt-20 pt-12 sm:pt-16 border-t border-border text-center">
          <a
            href="mailto:weval@cip.org"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium text-sm sm:text-base hover:bg-primary/90 transition-colors"
          >
            Get in touch
          </a>
          <p className="text-xs text-muted-foreground/60 mt-3">weval@cip.org</p>
        </div>
      </main>
    </div>
  );
}
