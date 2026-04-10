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

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
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
          defaultTheme="light"
          forcedTheme="light"
          disableTransitionOnChange
        >
          <Suspense fallback={null}>
            <TopProgressBar />
            <NavigationEvents />
          </Suspense>
          {children}
          <Toaster />
          {/* <ThemeToggle /> — temporarily hidden while dark mode is incomplete */}
        </ThemeProvider>
      </body>
    </html>
  );
}
