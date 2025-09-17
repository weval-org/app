"use client";
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { SiteFooter } from '@/app/components/SiteFooter';
import { SiteHeader } from '@/app/components/SiteHeader';
import { TopProgressBar } from '@/app/components/TopProgressBar';
import { NavigationEvents } from '@/app/components/NavigationEvents';

export default function FullWidthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isArticle = pathname?.includes('/article');
  const isCompare = pathname?.includes('/compare');

  if (isArticle) {
    return (
      <main className="w-full bg-background text-foreground">
        {children}
      </main>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Suspense fallback={null}>
        <TopProgressBar />
        <NavigationEvents />
      </Suspense>
      {!isCompare && (
        <SiteHeader contentMaxWidth={'max-w-[1800px]'} />
      )}
      <main className="flex-grow w-full bg-background text-foreground">
        <div className={isCompare ? 'w-full' : 'max-w-[1800px] mx-auto'}>
          {children}
        </div>
      </main>
      {!isCompare && (
        <SiteFooter contentMaxWidth={'max-w-[1800px]'} />
      )}
    </div>
  );
} 