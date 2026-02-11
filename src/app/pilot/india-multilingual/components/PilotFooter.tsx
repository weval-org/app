import React from 'react';
import CIPLogo from '@/components/icons/CIPLogo';

export function PilotFooter() {
  return (
    <footer className="pt-12 border-t border-border space-y-6">
      {/* Attribution */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <a
          href="https://cip.org"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <CIPLogo className="w-5 h-5" />
          <span>The Collective Intelligence Project</span>
        </a>

        <a
          href="https://weval.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Powered by Weval
        </a>
      </div>

      {/* Fine print */}
      <div className="text-xs text-muted-foreground space-y-2">
        <p>
          Human evaluation data collected via Karya platform with 120 native speakers
          across seven Indian languages: Hindi, Bengali, Telugu, Kannada, Malayalam,
          Assamese, and Marathi.
        </p>
        <p>
          Evaluation criteria include fluency, language complexity, code-switching appropriateness,
          and trustworthiness of information in legal and agricultural domains.
        </p>
      </div>

      {/* Copyright */}
      <div className="text-xs text-muted-foreground pt-4">
        © {new Date().getFullYear()} The Collective Intelligence Project. All rights reserved.
      </div>
    </footer>
  );
}
