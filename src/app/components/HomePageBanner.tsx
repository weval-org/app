'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/icon';


export default function HomePageBanner() {
  const [searchQuery, setSearchQuery] = React.useState('');
  const router = useRouter();

  const handleSearch = () => {
    const q = searchQuery.trim();
    if (q) {
      router.push(`/all?q=${encodeURIComponent(q)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="w-full pt-2 pb-2 text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mt-8 mb-2">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4 leading-tight">An open platform for building evaluations that test what matters</h1>
            <p className="max-w-4xl mx-auto text-base sm:text-xl text-foreground/80 dark:text-muted-foreground leading-relaxed">
            Transparent, reproducible qualitative benchmarks developed by a community of 1,000+ contributors.
            </p>
            <div className="mt-8 max-w-xl mx-auto flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Icon name="search" className="h-4 w-4 text-muted-foreground" />
                </div>
                <input
                  type="search"
                  placeholder="Search for an evaluation..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full rounded-md border border-input bg-background px-4 py-2 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                onClick={handleSearch}
                className="inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Search
              </button>
            </div>
        </div>

      </div>
    </div>
  );
};

