'use client';

import { use, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2 } from 'lucide-react';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';
import { EngClientPage } from '@/app/analysis/[configId]/[runLabel]/[timestamp]/eng/EngClientPage';
import { ComparisonDataV2 } from '@/app/utils/types';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ workshopId: string; wevalId: string }>;
}

export default function WorkshopEngPage({ params }: PageProps) {
  const { workshopId, wevalId } = use(params);
  const [data, setData] = useState<ComparisonDataV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`/api/workshop/weval/${workshopId}/${wevalId}`);

        if (!response.ok) {
          throw new Error('Failed to load workshop results');
        }

        const json = await response.json();

        if (!json.execution?.result) {
          throw new Error('No results available for this workshop evaluation');
        }

        setData(json.execution.result);
      } catch (err: any) {
        setError(err.message || 'Failed to load workshop results');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [workshopId, wevalId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading data explorer...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-screen items-center justify-center p-4">
        <Card className="p-6 max-w-md">
          <div className="flex items-start gap-3 text-destructive mb-4">
            <AlertCircle className="h-5 w-5 mt-0.5" />
            <div>
              <h2 className="font-semibold mb-1">Unable to Load Data Explorer</h2>
              <p className="text-sm">{error || 'This evaluation may not have results available.'}</p>
            </div>
          </div>
          <Button asChild className="w-full">
            <Link href={`/workshop/${workshopId}/weval/${wevalId}`}>Back to Results</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <AnalysisProvider
      initialData={data}
      configId={data.config.id!}
      runLabel={data.runLabel}
      timestamp={data.timestamp}
      isSandbox={false}
      workshopId={workshopId}
      wevalId={wevalId}
    >
      <EngClientPage />
    </AnalysisProvider>
  );
}
