'use client';

import { ModelSeriesRegression } from '@/types/regressions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, TrendingDown, TrendingUp, Calendar, GitBranch } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface SeriesDetailProps {
  series: ModelSeriesRegression;
  onBack: () => void;
  onViewComparison: (focusedType?: 'regressions' | 'improvements') => void;
}

export function SeriesDetail({ series, onBack, onViewComparison }: SeriesDetailProps) {
  const { versionComparison, regressions, improvements, sharedBlueprints } = series;

  const regressionsByType = regressions.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const improvementsByType = improvements.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const regressionsBySeverity = regressions.reduce((acc, r) => {
    acc[r.severity] = (acc[r.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Overview
        </Button>

        <h1 className="text-3xl font-bold mb-2">{series.seriesName}</h1>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Badge variant="outline">{series.maker}</Badge>
          <Badge variant="outline">{series.tier}</Badge>
          <span className="text-sm">•</span>
          <span className="text-sm">Severity: {series.overallRegressionScore}/100</span>
        </div>
      </div>

      {/* Version Comparison Card */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Version Comparison
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Older Version */}
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Older Version</div>
            <div className="font-semibold text-lg">{versionComparison.older.name}</div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {new Date(versionComparison.older.releaseDate).toLocaleDateString()}
            </div>
            <div className="text-xs text-muted-foreground">
              {versionComparison.older.id}
            </div>
          </div>

          {/* Arrow */}
          <div className="hidden md:flex items-center justify-center text-4xl text-muted-foreground">
            →
          </div>

          {/* Newer Version */}
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Newer Version</div>
            <div className="font-semibold text-lg">{versionComparison.newer.name}</div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {new Date(versionComparison.newer.releaseDate).toLocaleDateString()}
            </div>
            <div className="text-xs text-muted-foreground">
              {versionComparison.newer.id}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            Regressions
          </div>
          <div className="text-3xl font-bold mb-4">{regressions.length}</div>
          <div className="space-y-1 text-sm">
            {Object.entries(regressionsByType).map(([type, count]) => (
              <div key={type} className="flex justify-between">
                <span className="text-muted-foreground capitalize">{type}:</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Improvements
          </div>
          <div className="text-3xl font-bold mb-4">{improvements.length}</div>
          <div className="space-y-1 text-sm">
            {Object.entries(improvementsByType).map(([type, count]) => (
              <div key={type} className="flex justify-between">
                <span className="text-muted-foreground capitalize">{type}:</span>
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border rounded-lg p-4">
          <div className="text-sm text-muted-foreground mb-2">Severity Breakdown</div>
          <div className="text-3xl font-bold mb-4">{series.overallRegressionScore}/100</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Major:</span>
              <span className="font-medium text-red-600">{regressionsBySeverity['major'] || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Moderate:</span>
              <span className="font-medium text-orange-600">{regressionsBySeverity['moderate'] || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Minor:</span>
              <span className="font-medium text-yellow-600">{regressionsBySeverity['minor'] || 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Shared Blueprints */}
      <div className="bg-card border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Shared Blueprints ({sharedBlueprints.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sharedBlueprints.map((blueprint) => (
            <div key={blueprint.id} className="border rounded-lg p-3 space-y-1">
              <div className="font-medium text-sm">{blueprint.title}</div>
              <div className="text-xs text-muted-foreground">
                {blueprint.olderRunCount} older runs • {blueprint.newerRunCount} newer runs
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* View Detailed Comparison Buttons */}
      <div className="flex gap-4">
        <Button
          onClick={() => onViewComparison('regressions')}
          className="flex-1"
          variant="destructive"
        >
          <TrendingDown className="h-4 w-4 mr-2" />
          View All Regressions ({regressions.length})
        </Button>
        <Button
          onClick={() => onViewComparison('improvements')}
          className="flex-1"
          variant="default"
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          View All Improvements ({improvements.length})
        </Button>
      </div>
    </div>
  );
}
