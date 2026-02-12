import Link from 'next/link';
import CIPLogo from '@/components/icons/CIPLogo';
import { cn } from '@/lib/utils';

interface SiteHeaderProps {
  contentMaxWidth?: string;
}

export function SiteHeader({ contentMaxWidth = 'max-w-7xl' }: SiteHeaderProps) {
  return (
    <header className="w-full bg-header py-4 shadow-sm border-b border-border/50">
      <div className={cn("mx-auto px-4 sm:px-6 lg:px-8", contentMaxWidth)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/" aria-label="Homepage">
              <CIPLogo className="w-12 h-12 text-foreground" />
            </Link>
            <div>
              <Link href="/">
                <h1 className="text-4xl font-bold text-foreground">
                  <span style={{ fontWeight: 700 }}>w</span>
                  <span style={{ fontWeight: 200 }}>eval</span>
                </h1>
              </Link>
              <a
                href="https://cip.org"
                target="_blank"
                rel="noopener noreferrer"
                className="text-base text-muted-foreground leading-tight hover:underline text-sm"
              >
                A Collective Intelligence Project
              </a>
            </div>
          </div>
          <nav className="flex items-center space-x-1">
            <Link
              href="/all"
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
            >
              All Evals
            </Link>
            <Link
              href="/benchmarks"
              className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
            >
              Benchmarks
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
} 