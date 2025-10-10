'use client';

import { useState, useMemo } from 'react';
import { ModelSeriesRegression, RegressionCriterion } from '@/types/regressions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, TrendingDown, TrendingUp, Search, ExternalLink, FileText } from 'lucide-react';
import Link from 'next/link';

interface ComparisonViewProps {
  comparison: ModelSeriesRegression;
  focusedType?: 'regressions' | 'improvements';
  onBack: () => void;
}

export function ComparisonView({ comparison, focusedType = 'regressions', onBack }: ComparisonViewProps) {
  const [activeTab, setActiveTab] = useState<'regressions' | 'improvements'>(focusedType);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [filterBlueprint, setFilterBlueprint] = useState<string>('all');

  const { versionComparison, regressions, improvements, sharedBlueprints } = comparison;

  const activeItems = activeTab === 'regressions' ? regressions : improvements;

  const filtered = useMemo(() => {
    let result = activeItems;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item =>
        item.blueprintTitle.toLowerCase().includes(query) ||
        item.pointText?.toLowerCase().includes(query) ||
        item.dimensionKey?.toLowerCase().includes(query) ||
        item.promptText?.toLowerCase().includes(query)
      );
    }

    if (filterType !== 'all') {
      result = result.filter(item => item.type === filterType);
    }

    if (filterSeverity !== 'all') {
      result = result.filter(item => item.severity === filterSeverity);
    }

    if (filterBlueprint !== 'all') {
      result = result.filter(item => item.blueprintId === filterBlueprint);
    }

    return result;
  }, [activeItems, searchQuery, filterType, filterSeverity, filterBlueprint]);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'major': return 'destructive';
      case 'moderate': return 'warning';
      case 'minor': return 'secondary';
      default: return 'default';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'point': return '•';
      case 'prompt': return '📝';
      case 'dimension': return '📊';
      case 'blueprint': return '📁';
      default: return '?';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Series
        </Button>

        <h1 className="text-3xl font-bold mb-2">{comparison.seriesName}</h1>
        <p className="text-muted-foreground">
          {versionComparison.older.name} → {versionComparison.newer.name}
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="regressions" className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Regressions ({regressions.length})
          </TabsTrigger>
          <TabsTrigger value="improvements" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Improvements ({improvements.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-6">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search criteria, prompts, dimensions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="point">Point</SelectItem>
                <SelectItem value="prompt">Prompt</SelectItem>
                <SelectItem value="dimension">Dimension</SelectItem>
                <SelectItem value="blueprint">Blueprint</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterSeverity} onValueChange={setFilterSeverity}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="major">Major</SelectItem>
                <SelectItem value="moderate">Moderate</SelectItem>
                <SelectItem value="minor">Minor</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterBlueprint} onValueChange={setFilterBlueprint}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="All blueprints" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All blueprints</SelectItem>
                {sharedBlueprints.map(bp => (
                  <SelectItem key={bp.id} value={bp.id}>
                    {bp.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Results count */}
          <div className="text-sm text-muted-foreground">
            Showing {filtered.length} of {activeItems.length} {activeTab}
          </div>

          {/* Items List */}
          <div className="space-y-4">
            {filtered.map((item, idx) => (
              <div key={idx} className="bg-card border rounded-lg p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={getSeverityColor(item.severity) as any}>
                        {item.severity}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {getTypeIcon(item.type)} {item.type}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {item.blueprintTitle}
                      </span>
                    </div>

                    {/* Content based on type */}
                    {item.type === 'point' && item.pointText && (
                      <div className="text-sm">
                        <span className="font-medium">Criterion:</span>{' '}
                        {item.pointText}
                      </div>
                    )}

                    {item.type === 'dimension' && item.dimensionKey && (
                      <div className="text-sm">
                        <span className="font-medium">Dimension:</span>{' '}
                        <span className="capitalize">{item.dimensionKey}</span>
                      </div>
                    )}

                    {item.type === 'prompt' && item.promptText && (
                      <div className="text-sm">
                        <span className="font-medium">Prompt:</span>{' '}
                        <span className="text-muted-foreground line-clamp-1">
                          {item.promptText}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Score Change */}
                  <div className="text-right">
                    <div className={`text-lg font-bold ${activeTab === 'regressions' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {item.scoreDelta >= 0 ? '+' : ''}{(item.scoreDelta * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.olderVersion.score.toFixed(3)} → {item.newerVersion.score.toFixed(3)}
                    </div>
                  </div>
                </div>

                {/* Run Info */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                  <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <Link
                      href={`/results/${item.blueprintId}/${item.olderVersion.fileName.replace('_comparison.json', '')}`}
                      className="hover:underline"
                      target="_blank"
                    >
                      Older run
                      <ExternalLink className="inline h-3 w-3 ml-1" />
                    </Link>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    <Link
                      href={`/results/${item.blueprintId}/${item.newerVersion.fileName.replace('_comparison.json', '')}`}
                      className="hover:underline"
                      target="_blank"
                    >
                      Newer run
                      <ExternalLink className="inline h-3 w-3 ml-1" />
                    </Link>
                  </div>
                  <span>•</span>
                  <div>
                    {new Date(item.olderVersion.timestamp).toLocaleDateString()} → {new Date(item.newerVersion.timestamp).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                No {activeTab} found matching your filters
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
