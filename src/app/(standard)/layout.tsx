import { Suspense } from 'react';
import { SiteFooter } from '@/app/components/SiteFooter';
import { SiteHeader } from '@/app/components/SiteHeader';
import { TopProgressBar } from '@/app/components/TopProgressBar';
import { NavigationEvents } from '@/app/components/NavigationEvents';

export default function StandardWidthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-[#faf9f6] to-[#005B4A]/10">
      <Suspense fallback={null}>
        <TopProgressBar />
        <NavigationEvents />
      </Suspense>
      <SiteHeader contentMaxWidth="max-w-7xl" />
      <main className="flex-grow w-full text-foreground">
        <div className="max-w-7xl mx-auto">
            {children}
        </div>
      </main>
      <SiteFooter contentMaxWidth="max-w-7xl" />
    </div>
  );
} 