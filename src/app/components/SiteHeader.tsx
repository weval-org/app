import Link from 'next/link';
import CIPLogo from '@/components/icons/CIPLogo';
import { cn } from '@/lib/utils';

interface SiteHeaderProps {
  contentMaxWidth?: string;
}

export function SiteHeader({ contentMaxWidth = 'max-w-7xl' }: SiteHeaderProps) {
  return (
    <header className="w-full sticky top-0 z-50 py-4 border-b border-[#f2eaea] bg-[#faf9f6]/90 backdrop-blur-md">
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
          <nav className="flex items-center space-x-6">
            <Link href="/about" className="relative group text-sm font-medium text-foreground hover:text-foreground/70 transition-colors py-1">
              About
              <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-foreground transition-all duration-300 ease-out group-hover:w-full" />
            </Link>
            <Link href="/all" className="relative group text-sm font-medium text-foreground hover:text-foreground/70 transition-colors py-1">
              All Evals
              <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-foreground transition-all duration-300 ease-out group-hover:w-full" />
            </Link>
            <Link href="/benchmarks" className="relative group text-sm font-medium text-foreground hover:text-foreground/70 transition-colors py-1">
              Benchmarks
              <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-foreground transition-all duration-300 ease-out group-hover:w-full" />
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
} 