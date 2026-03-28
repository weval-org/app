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
        <div className="flex items-center gap-12 mt-8 mb-4">
          {/* Left: heading + subtext */}
          <div className="flex-1">
            <h1 className="text-3xl sm:text-4xl font-bold leading-tight mb-3">
              An open platform for building evaluations that test what matters
            </h1>
            <p className="text-sm sm:text-base text-foreground/70 leading-relaxed">
              Transparent, reproducible qualitative benchmarks developed by a community of 1,000+ contributors.
            </p>
          </div>

          {/* Right: search */}
          <div className="w-[420px] shrink-0">
            <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-4 py-3">
              <input
                type="search"
                placeholder="Search for an evaluation"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 text-sm text-foreground placeholder:text-muted-foreground bg-transparent focus:outline-none"
              />
              <button
                onClick={handleSearch}
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-foreground text-background hover:bg-foreground/80 transition-colors shrink-0"
                aria-label="Search"
              >
                <Icon name="arrow-right" className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
