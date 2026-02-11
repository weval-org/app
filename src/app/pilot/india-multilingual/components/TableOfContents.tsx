'use client';

import React, { useState, useEffect } from 'react';
import { List, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TOCItem {
  id: string;
  label: string;
}

const tocItems: TOCItem[] = [
  { id: 'head-to-head', label: 'Head-to-Head' },
  { id: 'rubric-ratings', label: 'Rubric Ratings' },
  { id: 'the-paradox', label: 'The Paradox' },
  { id: 'evaluators', label: 'Evaluators' },
  { id: 'human-vs-llm', label: 'Human vs. LLM' },
  { id: 'methodology', label: 'Methodology' },
  { id: 'data-explorer', label: 'Data Explorer' },
];

export function TableOfContents() {
  const [activeId, setActiveId] = useState<string>('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-20% 0% -60% 0%',
        threshold: 0,
      }
    );

    tocItems.forEach((item) => {
      const element = document.getElementById(item.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, []);

  const handleClick = (id: string) => {
    setIsOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* Desktop sidebar - fixed on left, below header */}
      <nav
        className="hidden xl:block fixed left-8 top-28 z-30"
        aria-label="Table of contents"
      >
        <div className="bg-background/80 backdrop-blur-sm rounded-lg border border-border/50 p-3 shadow-sm">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/50">
            <List className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Contents
            </span>
          </div>

          <ol className="space-y-1">
            {tocItems.map((item, index) => (
              <li key={item.id}>
                <button
                  onClick={() => handleClick(item.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded text-xs transition-all",
                    "hover:bg-muted/50 hover:text-foreground",
                    activeId === item.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground"
                  )}
                >
                  <span className="font-mono mr-2 opacity-50">{index + 1}</span>
                  {item.label}
                </button>
              </li>
            ))}
          </ol>
        </div>
      </nav>

      {/* Mobile floating button */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "xl:hidden fixed bottom-6 right-6 z-40",
          "w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg",
          "flex items-center justify-center",
          "hover:bg-primary/90 transition-colors",
          isOpen && "hidden"
        )}
        aria-label="Open table of contents"
      >
        <List className="w-5 h-5" />
      </button>

      {/* Mobile drawer */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="xl:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer */}
          <nav
            className="xl:hidden fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl border-t border-border p-6 pb-8 shadow-xl"
            aria-label="Table of contents"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <List className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Contents</span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-full hover:bg-muted transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <ol className="grid grid-cols-2 gap-2">
              {tocItems.map((item, index) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleClick(item.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all",
                      "hover:bg-muted/50",
                      activeId === item.id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground"
                    )}
                  >
                    <span className="font-mono mr-2 opacity-50 text-xs">{index + 1}</span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </>
      )}
    </>
  );
}
