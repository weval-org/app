import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Toaster } from '@/components/ui/toaster';
import TopProgressBar from './components/TopProgressBar';
import { Suspense } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NavigationEvents } from '@/app/components/NavigationEvents';

export const metadata = {
  title: 'Weval',
  description: 'An open-source framework for evaluation.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Suspense fallback={null}>
            <TopProgressBar />
            <NavigationEvents />
          </Suspense>
          {children}
          <Toaster />
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
