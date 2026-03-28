'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  APP_REPO_URL,
  BLUEPRINT_CONFIG_REPO_URL,
} from '@/lib/configConstants';
import { cn } from '@/lib/utils';
import { BugReportModal } from './BugReportModal';

interface SiteFooterProps {
  contentMaxWidth?: string;
}

export function SiteFooter({ contentMaxWidth = 'max-w-7xl' }: SiteFooterProps) {
  const pathname = usePathname();
  const [bugModalOpen, setBugModalOpen] = useState(false);

  return (
    <footer className="w-full border-t border-[#f2eaea] mt-16 py-12 bg-transparent">
      <div className={cn('mx-auto px-4 sm:px-6 lg:px-8', contentMaxWidth)}>
        <div className="flex flex-col md:flex-row justify-between items-start gap-12">

          {/* Left: brand */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="h-[30px] w-[27px] bg-[#009cff] rounded-sm flex items-center justify-center text-white font-bold text-base shrink-0">
                W
              </div>
              <p className="font-semibold text-sm text-foreground tracking-[0.02em]">
                Weval{' '}
                <span className="font-normal tracking-[0.01em]">a Collective Intelligence Project</span>
              </p>
            </div>
            <p className="text-sm text-muted-foreground tracking-[0.01em] ml-[35px]">
              Transparent, reproducible AI evaluations
            </p>
          </div>

          {/* Right: columns */}
          <div className="flex gap-16">
            {/* Partners */}
            <div>
              <h4 className="font-semibold text-sm text-foreground tracking-[0.01em] mb-3">Partners</h4>
              <ul className="space-y-2">
                <li><a href="https://anthropic.com" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors tracking-[0.01em]">Anthropic</a></li>
                <li><a href="https://microsoft.com" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors tracking-[0.01em]">Microsoft</a></li>
                <li><a href="https://stanford.edu" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors tracking-[0.01em]">Stanford University</a></li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold text-sm text-foreground tracking-[0.01em] mb-3">Contact</h4>
              <ul className="space-y-2">
                <li><a href="mailto:hello@weval.org" className="text-sm text-muted-foreground hover:text-foreground transition-colors tracking-[0.01em]">hello@weval.org</a></li>
                <li><Link href="/sandbox" className="text-sm text-muted-foreground hover:text-foreground transition-colors tracking-[0.01em]">Submit an evaluation</Link></li>
                <li><a href={`${APP_REPO_URL}/blob/main/docs/METHODOLOGY.md`} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors tracking-[0.01em]">Documentation</a></li>
                <li>
                  <button onClick={() => setBugModalOpen(true)} className="text-sm text-muted-foreground hover:text-foreground transition-colors tracking-[0.01em]">
                    Report a Bug
                  </button>
                </li>
              </ul>
            </div>
          </div>

        </div>
      </div>
      <BugReportModal open={bugModalOpen} onOpenChange={setBugModalOpen} pathname={pathname} />
    </footer>
  );
}
