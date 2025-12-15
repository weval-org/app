import { Suspense } from 'react';
import { SiteFooter } from '@/app/components/SiteFooter';
import { NavBarV2 } from '@/app/components/NavBarV2';
import { TopProgressBar } from '@/app/components/TopProgressBar';
import { NavigationEvents } from '@/app/components/NavigationEvents';

export default function V2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <Suspense fallback={null}>
        <TopProgressBar />
        <NavigationEvents />
      </Suspense>
      <NavBarV2 />
      <main className="flex-grow w-full bg-background text-foreground">
        {children}
      </main>
      <SiteFooter contentMaxWidth="max-w-7xl" />
    </div>
  );
}
