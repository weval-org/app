import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeToggle } from "@/components/ThemeToggle";
import TopProgressBar from "@/app/components/TopProgressBar";
import { Suspense } from 'react';

const geist = Geist({
  subsets: ["latin"],
  variable: '--font-geist-sans',
});

// This metadata is now primarily managed in metadata.ts
export const metadata: Metadata = {
  title: 'CivicEval',
  description: 'A framework for generating, analyzing, and visualizing the semantic similarity of responses from large language models.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Suspense fallback={null}>
            <TopProgressBar />
          </Suspense>
          {children}
          <Toaster />
          <ThemeToggle />
        </ThemeProvider>
      </body>
    </html>
  );
}
