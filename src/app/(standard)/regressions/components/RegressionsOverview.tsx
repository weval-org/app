'use client';

import { useState, useMemo } from 'react';
import { RegressionsSummary, ModelSeriesRegression } from '@/types/regressions';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingDown, TrendingUp, Search, ArrowUpDown } from 'lucide-react';

interface RegressionsOverviewProps {
  data: RegressionsSummary;
  stats: any;
  onSelectSeries: (series: ModelSeriesRegression) => void;
}

type SortField = 'severity' | 'regressions' | 'improvements' | 'name';

export function RegressionsOverview({ data, stats, onSelectSeries }: RegressionsOverviewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMaker, setFilterMaker] = useState<string>('all');
  const [filterTier, setFilterTier] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortField>('severity');
  const [sortDesc, setSortDesc] = useState(true);

  const makers = useMemo(() => {
    const unique = new Set(data.regressions.map(r => r.maker));
    return Array.from(unique).sort();
  }, [data]);

  const filtered = useMemo(() => {
    let result = data.regressions;

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.seriesName.toLowerCase().includes(query) ||
        r.seriesId.toLowerCase().includes(query)
      );
    }

    // Apply maker filter
    if (filterMaker !== 'all') {
      result = result.filter(r => r.maker === filterMaker);
    }

    // Apply tier filter
    if (filterTier !== 'all') {
      result = result.filter(r => r.tier === filterTier);
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      let aVal: number | string;
      let bVal: number | string;

      switch (sortBy) {
        case 'severity':
          aVal = a.overallRegressionScore;
          bVal = b.overallRegressionScore;
          break;
        case 'regressions':
          aVal = a.regressions.length;
          bVal = b.regressions.length;
          break;
        case 'improvements':
          aVal = a.improvements.length;
          bVal = b.improvements.length;
          break;
        case 'name':
          aVal = a.seriesName;
          bVal = b.seriesName;
          break;
        default:
          return 0;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDesc ? bVal - aVal : aVal - bVal;
      }

      return 0;
    });

    return result;
  }, [data.regressions, searchQuery, filterMaker, filterTier, sortBy, sortDesc]);

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(field);
      setSortDesc(true);
    }
  };

  const getSeverityColor = (score: number) => {
    if (score >= 50) return 'destructive';
    if (score >= 20) return 'warning';
    return 'secondary';
  };

  const getSeverityLabel = (score: number) => {
    if (score >= 50) return 'High';
    if (score >= 20) return 'Medium';
    return 'Low';
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search series..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={filterMaker} onValueChange={setFilterMaker}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="All makers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All makers</SelectItem>
            {makers.map(maker => (
              <SelectItem key={maker} value={maker}>
                {maker.charAt(0).toUpperCase() + maker.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTier} onValueChange={setFilterTier}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="All tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="fast">Fast</SelectItem>
            <SelectItem value="balanced">Balanced</SelectItem>
            <SelectItem value="powerful">Powerful</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {filtered.length} of {data.regressions.length} version comparisons
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSort('name')}
                  className="h-auto p-0 hover:bg-transparent"
                >
                  Model Series
                  <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </th>
              <th className="text-left p-4">Version Comparison</th>
              <th className="text-center p-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSort('severity')}
                  className="h-auto p-0 hover:bg-transparent"
                >
                  Severity
                  <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </th>
              <th className="text-center p-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSort('regressions')}
                  className="h-auto p-0 hover:bg-transparent"
                >
                  <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                  Regressions
                  <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </th>
              <th className="text-center p-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSort('improvements')}
                  className="h-auto p-0 hover:bg-transparent"
                >
                  <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                  Improvements
                  <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </th>
              <th className="text-center p-4">Shared Blueprints</th>
              <th className="text-right p-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((series) => (
              <tr
                key={series.seriesId}
                className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => onSelectSeries(series)}
              >
                <td className="p-4">
                  <div className="font-medium">{series.seriesName}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {series.maker}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {series.tier}
                    </Badge>
                  </div>
                </td>
                <td className="p-4 text-sm">
                  <div>{series.versionComparison.older.name}</div>
                  <div className="text-muted-foreground">→ {series.versionComparison.newer.name}</div>
                </td>
                <td className="p-4 text-center">
                  <Badge variant={getSeverityColor(series.overallRegressionScore) as any}>
                    {getSeverityLabel(series.overallRegressionScore)}
                  </Badge>
                  <div className="text-xs text-muted-foreground mt-1">
                    {series.overallRegressionScore}/100
                  </div>
                </td>
                <td className="p-4 text-center">
                  <div className="text-lg font-semibold text-red-600 dark:text-red-400">
                    {series.regressions.length}
                  </div>
                </td>
                <td className="p-4 text-center">
                  <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                    {series.improvements.length}
                  </div>
                </td>
                <td className="p-4 text-center text-sm text-muted-foreground">
                  {series.sharedBlueprints.length}
                </td>
                <td className="p-4 text-right">
                  <Button variant="ghost" size="sm">
                    View →
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No results found matching your filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
