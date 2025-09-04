'use client';

// Note: This page renders client-side because the sliders component is client-only.
// We fetch data via an API route or by importing a server helper from a client page is not ideal.
// To keep things simple and consistent with existing usage, we require the homepage summary to be passed
// down. As a pragmatic approach here, we'll dynamically import a small client fetcher to call an API route
// that serves the capability raw data from the server environment.

import React, { useEffect, useState } from 'react';
import DevModeCapabilitySliders from '@/app/components/home/DevModeCapabilitySliders';
import { CapabilityRawData } from '@/app/components/home/types';
import Link from 'next/link';
import Icon from '@/components/ui/icon';

async function fetchCapabilityRawData(): Promise<CapabilityRawData | null> {
  try {
    const res = await fetch('/api/homepage-summary', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.capabilityRawData || null;
  } catch {
    return null;
  }
}

export default function CapabilityTuningPage() {
  const [rawData, setRawData] = useState<CapabilityRawData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const rd = await fetchCapabilityRawData();
      if (mounted) {
        setRawData(rd);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (process.env.NODE_ENV !== 'development') {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-xl font-semibold mb-2">Capability Tuning (Dev Only)</h1>
        <p className="text-sm text-muted-foreground">This page is available in development builds only.</p>
        <div className="mt-4">
          <Link href="/" className="text-primary hover:underline inline-flex items-center gap-1">
            <Icon name="arrow-left" className="w-4 h-4" /> Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Capability Tuning</h1>
          <p className="text-sm text-muted-foreground">Adjust weights for dimensions, topics, blueprints, and compass axes. Live results update as you tune.</p>
        </div>
        <Link href="/" className="text-primary hover:underline inline-flex items-center gap-1">
          <Icon name="arrow-left" className="w-4 h-4" /> Back to Home
        </Link>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground">Loading capability data…</div>
      )}

      {!loading && !rawData && (
        <div className="text-sm text-muted-foreground">
          No capability data found. Try running the summary backfill locally and refresh.
        </div>
      )}

      {rawData && (
        <DevModeCapabilitySliders rawData={rawData} hideToggle />
      )}
    </div>
  );
}


