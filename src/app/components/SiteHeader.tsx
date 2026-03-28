import Link from 'next/link';
import CIPLogo from '@/components/icons/CIPLogo';
import Icon from '@/components/ui/icon';
import { cn } from '@/lib/utils';
import { APP_REPO_URL } from '@/lib/configConstants';

interface SiteHeaderProps {
  contentMaxWidth?: string;
}

export function SiteHeader({ contentMaxWidth = 'max-w-7xl' }: SiteHeaderProps) {
  return (
    <header className="w-full sticky top-0 z-50 py-4 border-b border-[#f2eaea] bg-[#faf9f6]/90 backdrop-blur-md">
      <div className={cn("mx-auto px-4 sm:px-6 lg:px-8", contentMaxWidth)}>
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <CIPLogo className="w-5 h-5 text-foreground" />
            <span className="font-bold text-foreground group-hover:underline">Weval</span>
            <span className="font-normal text-muted-foreground group-hover:underline">a Collective Intelligence Project</span>
          </Link>
          <nav className="flex items-center space-x-6">
            <Link href="/about" className="relative group text-sm font-medium text-foreground hover:text-foreground/70 transition-colors py-1">
              About
              <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-foreground transition-all duration-300 ease-out group-hover:w-full" />
            </Link>
            <a
              href={`${APP_REPO_URL}/blob/main/docs/METHODOLOGY.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="relative group text-sm font-medium text-foreground hover:text-foreground/70 transition-colors py-1 flex items-center gap-1"
            >
              Our Methodology
              <Icon name="external-link" className="w-3 h-3" />
              <span className="absolute bottom-0 left-0 w-0 h-[1px] bg-foreground transition-all duration-300 ease-out group-hover:w-full" />
            </a>
          </nav>
          <Link
            href="/sandbox"
            className="border border-foreground rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-foreground hover:text-background transition-colors"
          >
            + Create
          </Link>
        </div>
      </div>
    </header>
  );
} 