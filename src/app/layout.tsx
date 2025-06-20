import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeToggle } from "@/components/ThemeToggle";
import TopProgressBar from "@/app/components/TopProgressBar";
import { Suspense } from 'react';
import { colord } from 'colord';

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
  const colorPrimaryDark = process.env.NEXT_PUBLIC_THEME_COLOR_PRIMARY_DARK_HSL;
  const colorForeground = process.env.NEXT_PUBLIC_THEME_COLOR_FOREGROUND_HSL;
  const colorBackground = process.env.NEXT_PUBLIC_THEME_COLOR_BACKGROUND_HSL;
  const colorHeader = process.env.NEXT_PUBLIC_THEME_COLOR_HEADER_HSL;
  const colorSurface = process.env.NEXT_PUBLIC_THEME_COLOR_SURFACE_HSL;
  const colorDestructive = process.env.NEXT_PUBLIC_THEME_COLOR_DESTRUCTIVE_HSL;
  const colorAccent = process.env.NEXT_PUBLIC_THEME_COLOR_ACCENT_HSL;
  const colorWarning = process.env.NEXT_PUBLIC_THEME_COLOR_WARNING_HSL;
  const colorForegroundOnPrimary = process.env.NEXT_PUBLIC_THEME_COLOR_FOREGROUND_ON_PRIMARY_HSL;

  const allVars = [colorPrimary, colorPrimaryDark, colorForeground, colorBackground, colorHeader, colorSurface, colorDestructive, colorAccent, colorWarning, colorForegroundOnPrimary];
  const hasOverrides = allVars.some(Boolean);

  if (!hasOverrides) {
    return null;
  }

  const overrides: { [key: string]: string | undefined } = {};
  const darkOverrides: { [key: string]: string | undefined } = {};

  const toHslCss = (colorString: string | undefined): string | undefined => {
    if (!colorString) return undefined;
    try {
      const color = colord(colorString);
      if (!color.isValid()) return colorString;
      const { h, s, l } = color.toHsl();
      return `${h} ${s}% ${l}%`;
    } catch (e) {
      console.error("Error converting to HSL CSS:", e);
      return colorString;
    }
  };

  const adjustLightness = (colorString: string | undefined, percent: number): string | undefined => {
    if (!colorString) return undefined;
    try {
      const color = colord(colorString);
      if (!color.isValid()) return colorString;
      const hsl = color.toHsl();
      hsl.l = Math.max(0, Math.min(100, hsl.l + percent));
      return colord(hsl).toHslString();
    } catch (e) {
      console.error("Error adjusting lightness:", e);
      return colorString;
    }
  };

  // Light Mode Overrides
  if (colorBackground) overrides['--background'] = toHslCss(colorBackground);
  if (colorHeader) overrides['--header'] = toHslCss(colorHeader);
  if (colorSurface) {
    overrides['--surface'] = toHslCss(colorSurface);
    overrides['--card'] = toHslCss(colorSurface);
    overrides['--popover'] = toHslCss(colorSurface);
    overrides['--border'] = toHslCss(adjustLightness(colorSurface, -10));
    overrides['--input'] = toHslCss(adjustLightness(colorSurface, -10));
    overrides['--muted'] = toHslCss(adjustLightness(colorSurface, 5));
  }
  if (colorForeground) {
    overrides['--foreground'] = toHslCss(colorForeground);
    overrides['--card-foreground'] = toHslCss(colorForeground);
    overrides['--popover-foreground'] = toHslCss(colorForeground);
    overrides['--secondary-foreground'] = toHslCss(colorForeground);
    overrides['--accent-foreground'] = toHslCss(colorForeground);
    overrides['--muted-foreground'] = toHslCss(adjustLightness(colorForeground, 20));
  }
  if (colorPrimary) overrides['--primary'] = toHslCss(colorPrimary);
  if (colorForegroundOnPrimary) {
    overrides['--primary-foreground'] = toHslCss(colorForegroundOnPrimary);
    overrides['--destructive-foreground'] = toHslCss(colorForegroundOnPrimary); // Assuming same text color for red buttons
  }
  if (colorDestructive) overrides['--destructive'] = toHslCss(colorDestructive);
  if (colorAccent) overrides['--accent'] = toHslCss(colorAccent);
  if (colorWarning) overrides['--highlight-warning'] = toHslCss(colorWarning);
  
  // Dark Mode Overrides (inverting roles)
  if (colorForeground) darkOverrides['--background'] = toHslCss(colorForeground); // Black becomes background
  if (colorHeader && colorForeground) {
    darkOverrides['--header'] = toHslCss(adjustLightness(colorForeground, 3)); // Slightly lighter than background in dark mode
  }
  if (colorBackground) { // White becomes foreground
    darkOverrides['--foreground'] = toHslCss(colorBackground);
    darkOverrides['--card-foreground'] = toHslCss(colorBackground);
    darkOverrides['--popover-foreground'] = toHslCss(colorBackground);
    darkOverrides['--secondary-foreground'] = toHslCss(colorBackground);
    darkOverrides['--accent-foreground'] = toHslCss(colorBackground);
    darkOverrides['--muted-foreground'] = toHslCss(adjustLightness(colorBackground, -20));
  }
  // Dark mode surfaces can be a slightly lighter shade of the dark background
  if (colorForeground) {
    darkOverrides['--surface'] = toHslCss(adjustLightness(colorForeground, 5));
    darkOverrides['--card'] = toHslCss(adjustLightness(colorForeground, 5));
    darkOverrides['--popover'] = toHslCss(adjustLightness(colorForeground, 5));
    darkOverrides['--border'] = toHslCss(adjustLightness(colorForeground, 10));
    darkOverrides['--input'] = toHslCss(adjustLightness(colorForeground, 10));
    darkOverrides['--muted'] = toHslCss(adjustLightness(colorForeground, 5));
  }

  // Accent colors often remain the same or are brightened slightly
  if (colorPrimaryDark) {
    darkOverrides['--primary'] = toHslCss(colorPrimaryDark);
  } else if (colorPrimary) {
    darkOverrides['--primary'] = toHslCss(colorPrimary);
  }
  if (colorForegroundOnPrimary) darkOverrides['--primary-foreground'] = toHslCss(colorForegroundOnPrimary);
  if (colorDestructive) darkOverrides['--destructive'] = toHslCss(colorDestructive);
  if (colorAccent) darkOverrides['--accent'] = toHslCss(colorAccent);
  if (colorWarning) darkOverrides['--highlight-warning'] = toHslCss(colorWarning);


  const rootStyles = Object.entries(overrides).filter(([, value]) => value).map(([key, value]) => `${key}: ${value};`).join('\n');
  const darkStyles = Object.entries(darkOverrides).filter(([, value]) => value).map(([key, value]) => `${key}: ${value};`).join('\n');

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
