'use client';

import { usePathname } from 'next/navigation';
import CIPLogo from '@/components/icons/CIPLogo';
import {
  APP_REPO_URL,
  BLUEPRINT_CONFIG_REPO_URL,
  BUG_REPORT_FORM_URL,
  BUG_REPORT_FORM_PAGE_URL_ENTRY,
  BUG_REPORT_FORM_BLUEPRINT_ENTRY,
} from '@/lib/configConstants';
import { cn } from '@/lib/utils';

interface SiteFooterProps {
  contentMaxWidth?: string;
}

function useBugReportUrls() {
  const pathname = usePathname();

  const pageUrl =
    typeof window !== 'undefined' ? window.location.href : pathname || '';

  // Extract blueprint ID from /analysis/[configId]/... paths
  const match = pathname?.match(/^\/analysis\/([^/]+)/);
  const blueprintId = match ? decodeURIComponent(match[1]) : '';

  // GitHub issue URL
  const ghParams = new URLSearchParams({ template: 'bug_report.yml' });
  if (pageUrl) ghParams.set('page-url', pageUrl);
  if (blueprintId) ghParams.set('blueprint-id', blueprintId);
  const githubUrl = `${APP_REPO_URL}/issues/new?${ghParams.toString()}`;

  // Google Form URL (pre-filled)
  let formUrl = '';
  if (BUG_REPORT_FORM_URL) {
    const formParams = new URLSearchParams();
    if (pageUrl && BUG_REPORT_FORM_PAGE_URL_ENTRY) {
      formParams.set(BUG_REPORT_FORM_PAGE_URL_ENTRY, pageUrl);
    }
    if (blueprintId && BUG_REPORT_FORM_BLUEPRINT_ENTRY) {
      formParams.set(BUG_REPORT_FORM_BLUEPRINT_ENTRY, blueprintId);
    }
    const qs = formParams.toString();
    formUrl = BUG_REPORT_FORM_URL + (qs ? `?${qs}` : '');
  }

  return { githubUrl, formUrl };
}

export function SiteFooter({ contentMaxWidth = 'max-w-7xl' }: SiteFooterProps) {
  const { githubUrl, formUrl } = useBugReportUrls();

  return (
    <div className="w-full bg-header py-6 border-t border-border/50">
      <div className={cn("mx-auto px-4 sm:px-6 lg:px-8", contentMaxWidth)}>
        <footer className="flex flex-col md:flex-row items-center justify-between gap-6">
          <a
            href="https://cip.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-3 group"
          >
            <CIPLogo className="w-8 h-8 text-muted-foreground group-hover:text-foreground transition-colors duration-200" />
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors duration-200">
              A Collective Intelligence Project
            </span>
          </a>
          <div className="flex items-center space-x-4 text-sm">
            <a
              href={APP_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors"
            >
              View App on GitHub
            </a>
            <span className="text-muted-foreground/60">|</span>
            <a
              href={BLUEPRINT_CONFIG_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors"
            >
              View Eval Blueprints on GitHub
            </a>
            <span className="text-muted-foreground/60">|</span>
            {formUrl ? (
              <a
                href={formUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors"
              >
                Report a Bug
              </a>
            ) : (
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary dark:hover:text-sky-400 transition-colors"
              >
                Report a Bug
              </a>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
