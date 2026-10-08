'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EnhancedRunInfo } from '@/app/utils/homepageDataUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import ClientDateTime from '@/app/components/ClientDateTime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import Icon from '@/components/ui/icon';

const PAGE_SIZE = 25;

type SortKey = 'date' | 'version' | 'score' | 'topModel' | 'models' | 'prompts';
type SortDir = 'asc' | 'desc';

interface RunRow {
    run: EnhancedRunInfo;
    safeTimestamp: string;
    time: number;
    score: number | null;
    scoreStdDev: number | null;
    topModelId: string | null;
    topModelScore: number | null;
    modelIds: string[];
    versionRunCount: number;
    isLatestOverall: boolean;
    isLatestForVersion: boolean;
}

const getScoreColor = (score: number | null | undefined): string => {
    if (score === null || score === undefined || isNaN(score)) return 'text-muted-foreground';
    if (score >= 0.8) return 'text-emerald-600 dark:text-emerald-400';
    if (score >= 0.6) return 'text-lime-600 dark:text-lime-400';
    if (score >= 0.4) return 'text-amber-600 dark:text-amber-400';
    return 'text-red-600 dark:text-red-400';
};

const isNum = (v: unknown): v is number => typeof v === 'number' && !isNaN(v);

function perModelEntries(run: EnhancedRunInfo): Array<[string, number | null]> {
    const source: any = run.perModelScores ?? run.perModelHybridScores;
    if (!source) return [];
    const entries: Array<[string, any]> = source instanceof Map
        ? Array.from(source.entries())
        : Object.entries(source);
    return entries.map(([modelId, data]) => {
        // Support both the PerModelScoreStats shape and the older flat { average } shape
        const avg = data?.hybrid?.average ?? data?.average;
        return [modelId, isNum(avg) ? avg : null];
    });
}

function buildRows(runs: EnhancedRunInfo[]): RunRow[] {
    const versionCounts = new Map<string, number>();
    const latestPerVersion = new Map<string, number>();
    let latestOverall = -Infinity;

    const partial = runs.map(run => {
        const time = new Date(fromSafeTimestamp(run.timestamp)).getTime();
        const t = isNaN(time) ? 0 : time;
        versionCounts.set(run.runLabel, (versionCounts.get(run.runLabel) || 0) + 1);
        latestPerVersion.set(run.runLabel, Math.max(latestPerVersion.get(run.runLabel) ?? -Infinity, t));
        latestOverall = Math.max(latestOverall, t);

        let topModelId: string | null = null;
        let topModelScore: number | null = null;
        const scored = perModelEntries(run).filter(([id]) => id !== IDEAL_MODEL_ID);
        for (const [id, avg] of scored) {
            if (avg !== null && (topModelScore === null || avg > topModelScore)) {
                topModelId = id;
                topModelScore = avg;
            }
        }
        const modelIds = (run.models && run.models.length > 0 ? run.models : scored.map(([id]) => id))
            .filter(id => id !== IDEAL_MODEL_ID);

        const score = run.hybridScoreStats?.average;
        const stddev = run.hybridScoreStats?.stddev;
        return {
            run,
            safeTimestamp: run.timestamp,
            time: t,
            score: isNum(score) ? score : null,
            scoreStdDev: isNum(stddev) ? stddev : null,
            topModelId,
            topModelScore,
            modelIds,
        };
    });

    return partial.map(row => ({
        ...row,
        versionRunCount: versionCounts.get(row.run.runLabel) || 1,
        isLatestOverall: row.time === latestOverall,
        isLatestForVersion: row.time === latestPerVersion.get(row.run.runLabel),
    }));
}

function compareRows(a: RunRow, b: RunRow, key: SortKey): number {
    // Nulls always sort last regardless of direction is handled by the caller.
    switch (key) {
        case 'date': return a.time - b.time;
        case 'version': return a.run.runLabel.localeCompare(b.run.runLabel) || a.time - b.time;
        case 'score': return (a.score ?? -1) - (b.score ?? -1);
        case 'topModel': return (a.topModelScore ?? -1) - (b.topModelScore ?? -1);
        case 'models': return (a.run.numModels ?? a.modelIds.length) - (b.run.numModels ?? b.modelIds.length);
        case 'prompts': return (a.run.numPrompts ?? -1) - (b.run.numPrompts ?? -1);
    }
}

const thClass = 'px-4 py-3.5 text-sm font-semibold text-foreground dark:text-foreground';
const tdClass = 'px-4 py-3 text-sm';

interface SortableHeadProps {
    label: string;
    sortKey: SortKey;
    activeKey: SortKey;
    dir: SortDir;
    onSort: (key: SortKey) => void;
    icon?: React.ComponentProps<typeof Icon>['name'];
    align?: 'left' | 'right';
}

const SortableHead: React.FC<SortableHeadProps> = ({ label, sortKey, activeKey, dir, onSort, icon, align = 'left' }) => {
    const active = sortKey === activeKey;
    const sortIcon = !active ? 'chevrons-up-down' : dir === 'asc' ? 'chevron-up' : 'chevron-down';
    return (
        <th
            scope="col"
            className={`${thClass} ${align === 'right' ? 'text-right' : 'text-left'}`}
            aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
            <button
                type="button"
                onClick={() => onSort(sortKey)}
                className={`inline-flex items-center gap-1.5 hover:text-primary transition-colors ${align === 'right' ? 'flex-row-reverse' : ''}`}
            >
                {icon && <Icon name={icon} className="w-4 h-4 opacity-80" />}
                <span>{label}</span>
                <Icon name={sortIcon} className={`w-3.5 h-3.5 ${active ? '' : 'opacity-40'}`} />
            </button>
        </th>
    );
};

interface BlueprintRunsTableProps {
    configId: string;
    runs: EnhancedRunInfo[];
    /** Hide the version column and per-version controls (used on a single version's page). */
    singleVersion?: boolean;
}

const BlueprintRunsTable: React.FC<BlueprintRunsTableProps> = ({ configId, runs, singleVersion = false }) => {
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [latestPerVersionOnly, setLatestPerVersionOnly] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>('date');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [page, setPage] = useState(0);

    const allRows = useMemo(() => buildRows(runs), [runs]);
    const versionCount = useMemo(() => new Set(runs.map(r => r.runLabel)).size, [runs]);
    const showTemperature = useMemo(() => runs.some(r => isNum(r.temperature)), [runs]);

    const visibleRows = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = allRows.filter(row => {
            if (latestPerVersionOnly && !row.isLatestForVersion) return false;
            if (!q) return true;
            if (row.run.runLabel.toLowerCase().includes(q)) return true;
            return row.modelIds.some(id =>
                id.toLowerCase().includes(q) ||
                getModelDisplayLabel(id, { hideProvider: true }).toLowerCase().includes(q)
            );
        });
        const sign = sortDir === 'asc' ? 1 : -1;
        return filtered.sort((a, b) => sign * compareRows(a, b, sortKey) || b.time - a.time);
    }, [allRows, search, latestPerVersionOnly, sortKey, sortDir]);

    const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const pageRows = visibleRows.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

    const handleSort = (key: SortKey) => {
        if (key === sortKey) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            // Text columns read naturally ascending; dates and numbers best-first.
            setSortDir(key === 'version' ? 'asc' : 'desc');
        }
        setPage(0);
    };

    const runUrl = (row: RunRow) =>
        `/analysis/${configId}/${encodeURIComponent(row.run.runLabel)}/${row.safeTimestamp}`;
    const versionUrl = (row: RunRow) =>
        `/analysis/${configId}/${encodeURIComponent(row.run.runLabel)}`;

    const headProps = { activeKey: sortKey, dir: sortDir, onSort: handleSort };

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <div className="relative w-full sm:max-w-xs">
                    <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(0); }}
                        placeholder={singleVersion ? 'Filter by model…' : 'Filter by version or model…'}
                        className="pl-8 h-9"
                        aria-label="Filter runs"
                    />
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {!singleVersion && versionCount > 1 && (
                        <div className="flex items-center gap-2">
                            <Switch
                                id="latest-per-version"
                                checked={latestPerVersionOnly}
                                onCheckedChange={v => { setLatestPerVersionOnly(v); setPage(0); }}
                            />
                            <Label htmlFor="latest-per-version" className="font-normal cursor-pointer">
                                Latest run per version
                            </Label>
                        </div>
                    )}
                    <span className="whitespace-nowrap">
                        {visibleRows.length === allRows.length
                            ? `${allRows.length} run${allRows.length === 1 ? '' : 's'}`
                            : `${visibleRows.length} of ${allRows.length} runs`}
                        {!singleVersion && ` · ${versionCount} version${versionCount === 1 ? '' : 's'}`}
                    </span>
                </div>
            </div>

            {visibleRows.length === 0 ? (
                <div className="text-center py-10 bg-card/50 dark:bg-card/40 rounded-lg shadow-md">
                    <Icon name="search-x" className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No runs match your filters.</p>
                </div>
            ) : (
                <div className="bg-card/70 dark:bg-card/60 backdrop-blur-sm rounded-lg shadow-lg ring-1 ring-border dark:ring-border/60 overflow-x-auto">
                    <table className="min-w-full divide-y divide-border dark:divide-border/50">
                        <thead className="bg-muted/30 dark:bg-muted/30">
                            <tr>
                                <SortableHead label="Executed" sortKey="date" icon="history" {...headProps} />
                                {!singleVersion && <SortableHead label="Version" sortKey="version" icon="hash" {...headProps} />}
                                <SortableHead label="Hybrid Score" sortKey="score" {...headProps} />
                                <SortableHead label="Top Model" sortKey="topModel" icon="trophy" {...headProps} />
                                <SortableHead label="Models" sortKey="models" align="right" {...headProps} />
                                <SortableHead label="Prompts" sortKey="prompts" align="right" {...headProps} />
                                {showTemperature && <th scope="col" className={`${thClass} text-right`}>Temp.</th>}
                                <th scope="col" className={`${thClass} text-center`}>Analysis</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border dark:divide-border/40 bg-card dark:bg-card/50">
                            {pageRows.map(row => {
                                const { run } = row;
                                const href = runUrl(row);
                                const attempted = run.totalModelsAttempted;
                                const numModels = run.numModels ?? (row.modelIds.length || undefined);
                                return (
                                    <tr
                                        key={`${run.runLabel}-${row.safeTimestamp}`}
                                        className="hover:bg-muted/50 dark:hover:bg-muted/50 transition-colors cursor-pointer group"
                                        onClick={e => {
                                            // Let real links (and modifier-clicks) behave normally.
                                            if ((e.target as HTMLElement).closest('a')) return;
                                            router.push(href);
                                        }}
                                    >
                                        <td className={`${tdClass} whitespace-nowrap`}>
                                            <div className="flex items-center gap-2">
                                                <Link href={href} className="font-medium text-primary hover:underline">
                                                    <ClientDateTime timestamp={row.safeTimestamp} />
                                                </Link>
                                                {row.isLatestOverall && (
                                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Latest</Badge>
                                                )}
                                            </div>
                                        </td>
                                        {!singleVersion && (
                                            <td className={`${tdClass} whitespace-nowrap`}>
                                                <Link
                                                    href={versionUrl(row)}
                                                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:underline group-hover:text-foreground"
                                                    title={`${run.runLabel} — view all ${row.versionRunCount} run${row.versionRunCount === 1 ? '' : 's'} of this version`}
                                                >
                                                    <span className="truncate block max-w-[8rem]">{run.runLabel}</span>
                                                    {row.versionRunCount > 1 && (
                                                        <span className="text-xs text-muted-foreground">×{row.versionRunCount}</span>
                                                    )}
                                                </Link>
                                            </td>
                                        )}
                                        <td className={`${tdClass} whitespace-nowrap`}>
                                            {row.score !== null ? (
                                                <span className={`font-semibold ${getScoreColor(row.score)}`}>
                                                    {(row.score * 100).toFixed(1)}%
                                                    {row.scoreStdDev !== null && (
                                                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                                                            ±{(row.scoreStdDev * 100).toFixed(1)}
                                                        </span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span className={`font-semibold ${getScoreColor(null)}`}>N/A</span>
                                            )}
                                        </td>
                                        <td className={`${tdClass} whitespace-nowrap`}>
                                            {row.topModelId ? (
                                                <>
                                                    <span className="block font-semibold text-xs truncate max-w-[180px]" title={row.topModelId}>
                                                        {getModelDisplayLabel(row.topModelId, { hideProvider: true })}
                                                    </span>
                                                    {row.topModelScore !== null && (
                                                        <span className={`text-xs ${getScoreColor(row.topModelScore)}`}>
                                                            {(row.topModelScore * 100).toFixed(1)}%
                                                        </span>
                                                    )}
                                                </>
                                            ) : (
                                                <span className={`font-normal ${getScoreColor(null)}`}>N/A</span>
                                            )}
                                        </td>
                                        <td
                                            className={`${tdClass} text-right whitespace-nowrap text-muted-foreground`}
                                            title={row.modelIds.length > 0 ? row.modelIds.map(id => getModelDisplayLabel(id)).join('\n') : undefined}
                                        >
                                            {numModels ?? '—'}
                                            {isNum(attempted) && isNum(numModels) && attempted > numModels && (
                                                <span className="text-xs"> / {attempted}</span>
                                            )}
                                        </td>
                                        <td className={`${tdClass} text-right text-muted-foreground`}>{run.numPrompts ?? '—'}</td>
                                        {showTemperature && (
                                            <td className={`${tdClass} text-right text-muted-foreground`}>
                                                {isNum(run.temperature) ? run.temperature : '—'}
                                            </td>
                                        )}
                                        <td className={`${tdClass} whitespace-nowrap text-center`}>
                                            <Link
                                                href={href}
                                                className="inline-block px-3 py-1.5 text-xs font-medium rounded-md text-primary hover:bg-primary/10 transition-colors border border-primary/30 hover:border-primary/50"
                                            >
                                                View Analysis
                                            </Link>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {pageCount > 1 && (
                <div className="flex items-center justify-end gap-2 text-sm">
                    <span className="text-muted-foreground mr-2">
                        Page {currentPage + 1} of {pageCount}
                    </span>
                    <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                        <Icon name="chevron-left" className="w-4 h-4" />
                        Prev
                    </Button>
                    <Button variant="outline" size="sm" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>
                        Next
                        <Icon name="chevron-right" className="w-4 h-4" />
                    </Button>
                </div>
            )}
        </div>
    );
};

export default BlueprintRunsTable;
