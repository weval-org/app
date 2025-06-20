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
  title: 'Weval',
  description: 'A framework for generating, analyzing, and visualizing the semantic similarity of responses from large language models.',
};

const getThemeOverrides = () => {
  const colorPrimary = process.env.NEXT_PUBLIC_THEME_COLOR_PRIMARY_HSL;
  const colorForeground = process.env.NEXT_PUBLIC_THEME_COLOR_FOREGROUND_HSL;
  const colorBackground = process.env.NEXT_PUBLIC_THEME_COLOR_BACKGROUND_HSL;
  const colorHeader = process.env.NEXT_PUBLIC_THEME_COLOR_HEADER_HSL;
  const colorSurface = process.env.NEXT_PUBLIC_THEME_COLOR_SURFACE_HSL;
  const colorDestructive = process.env.NEXT_PUBLIC_THEME_COLOR_DESTRUCTIVE_HSL;
  const colorAccent = process.env.NEXT_PUBLIC_THEME_COLOR_ACCENT_HSL;
  const colorWarning = process.env.NEXT_PUBLIC_THEME_COLOR_WARNING_HSL;
  const colorForegroundOnPrimary = process.env.NEXT_PUBLIC_THEME_COLOR_FOREGROUND_ON_PRIMARY_HSL;

  const allVars = [colorPrimary, colorForeground, colorBackground, colorHeader, colorSurface, colorDestructive, colorAccent, colorWarning, colorForegroundOnPrimary];
  const hasOverrides = allVars.some(Boolean);

  if (!hasOverrides) {
    return null;
  }

  const overrides: { [key: string]: string } = {};
  const darkOverrides: { [key: string]: string } = {};

  const adjustLightness = (hsl: string, percent: number) => {
    const [h, s, l] = hsl.split(' ');
    const newL = Math.max(0, Math.min(100, parseFloat(l) + percent));
    return `${h} ${s} ${newL}%`;
  };

  // Light Mode Overrides
  if (colorBackground) overrides['--background'] = colorBackground;
  if (colorHeader) overrides['--header'] = colorHeader;
  if (colorSurface) {
    overrides['--surface'] = colorSurface;
    overrides['--card'] = colorSurface;
    overrides['--popover'] = colorSurface;
    overrides['--border'] = adjustLightness(colorSurface, -10);
    overrides['--input'] = adjustLightness(colorSurface, -10);
    overrides['--muted'] = adjustLightness(colorSurface, 5);
  }
  if (colorForeground) {
    overrides['--foreground'] = colorForeground;
    overrides['--card-foreground'] = colorForeground;
    overrides['--popover-foreground'] = colorForeground;
    overrides['--secondary-foreground'] = colorForeground;
    overrides['--accent-foreground'] = colorForeground;
    overrides['--muted-foreground'] = adjustLightness(colorForeground, 20);
  }
  if (colorPrimary) overrides['--primary'] = colorPrimary;
  if (colorForegroundOnPrimary) {
    overrides['--primary-foreground'] = colorForegroundOnPrimary;
    overrides['--destructive-foreground'] = colorForegroundOnPrimary; // Assuming same text color for red buttons
  }
  if (colorDestructive) overrides['--destructive'] = colorDestructive;
  if (colorAccent) overrides['--accent'] = colorAccent;
  if (colorWarning) overrides['--highlight-warning'] = colorWarning;
  
  // Dark Mode Overrides (inverting roles)
  if (colorForeground) darkOverrides['--background'] = colorForeground; // Black becomes background
  if (colorHeader && colorForeground) {
    darkOverrides['--header'] = adjustLightness(colorForeground, 3); // Slightly lighter than background in dark mode
  }
  if (colorBackground) { // White becomes foreground
    darkOverrides['--foreground'] = colorBackground;
    darkOverrides['--card-foreground'] = colorBackground;
    darkOverrides['--popover-foreground'] = colorBackground;
    darkOverrides['--secondary-foreground'] = colorBackground;
    darkOverrides['--accent-foreground'] = colorBackground;
    darkOverrides['--muted-foreground'] = adjustLightness(colorBackground, -20);
  }
  // Dark mode surfaces can be a slightly lighter shade of the dark background
  if (colorForeground) {
    const darkSurfaceColor = adjustLightness(colorForeground, 5);
    darkOverrides['--surface'] = darkSurfaceColor;
    darkOverrides['--card'] = darkSurfaceColor;
    darkOverrides['--popover'] = darkSurfaceColor;
    darkOverrides['--border'] = adjustLightness(colorForeground, 10);
    darkOverrides['--input'] = adjustLightness(colorForeground, 10);
    darkOverrides['--muted'] = adjustLightness(colorForeground, 5);
  }

  // Accent colors often remain the same or are brightened slightly
  if (colorPrimary) darkOverrides['--primary'] = colorPrimary;
  if (colorForegroundOnPrimary) darkOverrides['--primary-foreground'] = colorForegroundOnPrimary;
  if (colorDestructive) darkOverrides['--destructive'] = colorDestructive;
  if (colorAccent) darkOverrides['--accent'] = colorAccent;
  if (colorWarning) darkOverrides['--highlight-warning'] = colorWarning;


  const rootStyles = Object.entries(overrides).map(([key, value]) => `${key}: ${value};`).join('\n');
  const darkStyles = Object.entries(darkOverrides).map(([key, value]) => `${key}: ${value};`).join('\n');

  return `
    :root {
      ${rootStyles}
    }
    .dark {
      ${darkStyles}
    }
  `;
};

const ThemeStyleOverrides = () => {
    const styles = getThemeOverrides();
    if (!styles) return null;
    return <style dangerouslySetInnerHTML={{ __html: styles }} />;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <head>
        <ThemeStyleOverrides />
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
