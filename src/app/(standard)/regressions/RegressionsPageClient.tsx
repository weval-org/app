'use client';

import { useState, useEffect, useMemo } from 'react';
import { RegressionsSummary, ModelSeriesRegression, RegressionCriterion } from '@/types/regressions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RegressionsOverview } from './components/RegressionsOverview';
import { SeriesDetail } from './components/SeriesDetail';
import { ComparisonView } from './components/ComparisonView';
import { AlertCircle, TrendingDown, TrendingUp } from 'lucide-react';

export function RegressionsPageClient() {
  const [data, setData] = useState<RegressionsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeries, setSelectedSeries] = useState<ModelSeriesRegression | null>(null);
  const [selectedComparison, setSelectedComparison] = useState<{
    series: ModelSeriesRegression;
    focusedType?: 'regressions' | 'improvements';
  } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/api/regressions-summary');
        if (!response.ok) {
          throw new Error(`Failed to load regressions data: ${response.statusText}`);
        }
        const json = await response.json();
        setData(json);
      } catch (err: any) {
        console.error('Error loading regressions:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;

    const totalRegressionCount = data.regressions.reduce((sum, r) => sum + r.regressions.length, 0);
    const totalImprovementCount = data.regressions.reduce((sum, r) => sum + r.improvements.length, 0);

    const byMaker = data.regressions.reduce((acc, reg) => {
      const maker = reg.maker;
      if (!acc[maker]) {
        acc[maker] = { regressions: 0, improvements: 0, comparisons: 0 };
      }
      acc[maker].regressions += reg.regressions.length;
      acc[maker].improvements += reg.improvements.length;
      acc[maker].comparisons += 1;
      return acc;
    }, {} as Record<string, { regressions: number; improvements: number; comparisons: number }>);

    const byTier = data.regressions.reduce((acc, reg) => {
      const tier = reg.tier;
      if (!acc[tier]) {
        acc[tier] = { regressions: 0, improvements: 0, comparisons: 0 };
      }
      acc[tier].regressions += reg.regressions.length;
      acc[tier].improvements += reg.improvements.length;
      acc[tier].comparisons += 1;
      return acc;
    }, {} as Record<string, { regressions: number; improvements: number; comparisons: number }>);

    return {
      totalRegressionCount,
      totalImprovementCount,
      byMaker,
      byTier,
    };
  }, [data]);

  if (loading) {
    return (
      <div className="container mx-auto py-8 max-w-7xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-2/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
            <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
            <div className="h-32 bg-gray-200 dark:bg-gray-800 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-8 max-w-7xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load regression data: {error}
            <br />
            <br />
            Make sure you've run: <code className="bg-black/10 px-2 py-1 rounded">pnpm cli:generate-regressions</code>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  // If a comparison is selected, show detailed view
  if (selectedComparison) {
    return (
      <div className="container mx-auto py-8 max-w-7xl">
        <ComparisonView
          comparison={selectedComparison.series}
          focusedType={selectedComparison.focusedType}
          onBack={() => setSelectedComparison(null)}
        />
      </div>
    );
  }

  // If a series is selected, show series detail
  if (selectedSeries) {
    return (
      <div className="container mx-auto py-8 max-w-7xl">
        <SeriesDetail
          series={selectedSeries}
          onBack={() => setSelectedSeries(null)}
          onViewComparison={(focusedType) => setSelectedComparison({ series: selectedSeries, focusedType })}
        />
      </div>
    );
  }

  // Otherwise show overview
  return (
    <div className="container mx-auto py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Model Regressions</h1>
        <p className="text-muted-foreground">
          Track performance changes across model versions and releases
        </p>
      </div>

      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Total Regressions
            </div>
            <div className="text-2xl font-bold">{stats.totalRegressionCount}</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Total Improvements
            </div>
            <div className="text-2xl font-bold">{stats.totalImprovementCount}</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1">Version Comparisons</div>
            <div className="text-2xl font-bold">{data.metadata.totalVersionComparisons}</div>
          </div>
          <div className="bg-card border rounded-lg p-4">
            <div className="text-sm text-muted-foreground mb-1">Blueprints Scanned</div>
            <div className="text-2xl font-bold">{data.metadata.totalBlueprintsScanned}</div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <RegressionsOverview
        data={data}
        stats={stats}
        onSelectSeries={setSelectedSeries}
      />

      {/* Metadata Footer */}
      <div className="mt-8 text-xs text-muted-foreground border-t pt-4">
        <p>
          Generated: {new Date(data.generatedAt).toLocaleString()} |
          Series analyzed: {data.metadata.totalSeriesAnalyzed} |
          Min threshold: {(data.thresholds.minScoreDelta * 100).toFixed(1)}%
        </p>
      </div>
    </div>
  );
}
