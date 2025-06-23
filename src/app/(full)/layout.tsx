import { SiteFooter } from '@/app/components/SiteFooter';
import { SiteHeader } from '@/app/components/SiteHeader';

export default function FullWidthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader contentMaxWidth="max-w-[1800px]" />
      <main className="flex-grow w-full bg-background text-foreground">
        <div className="max-w-[1800px] mx-auto">
            {children}
        </div>
      </main>
      <SiteFooter contentMaxWidth="max-w-[1800px]" />
    </div>
  );
} 