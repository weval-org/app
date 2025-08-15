'use client';
import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import VibeMap from './components/VibeMap';

type VibesIndex = {
  models: Record<string, { averageHybrid: number | null; totalRuns: number; uniqueConfigs: number }>;
  similarity: Record<string, Record<string, { score: number; count: number }>>;
  capabilityScores?: Record<string, Record<string, { score: number | null; contributingRuns: number }>>;
  generatedAt: string;
};

export default function VibesPage() {
  const [data, setData] = React.useState<VibesIndex | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/vibes');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (mounted) setData(json);
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);
  const [alpha, setAlpha] = React.useState<number>(0.5);
  const [capWeight, setCapWeight] = React.useState<number>(0);
  const [minCapRuns, setMinCapRuns] = React.useState<number>(3);
  const capabilityIds = React.useMemo(() => {
    if (!data?.capabilityScores) return [] as string[];
    const allCaps = new Set<string>();
    Object.values(data.capabilityScores).forEach(byCap => {
      Object.keys(byCap).forEach(id => allCaps.add(id));
    });
    return Array.from(allCaps).sort();
  }, [data]);
  const [capability, setCapability] = React.useState<string>('');
  React.useEffect(() => {
    if (!capability && capabilityIds.length > 0) setCapability(capabilityIds[0]);
  }, [capabilityIds, capability]);
  const [target, setTarget] = React.useState<string>('');

  const modelIds = React.useMemo(() => (data ? Object.keys(data.models).sort() : []), [data]);
  React.useEffect(() => {
    if (!target && modelIds.length > 0) setTarget(modelIds[0]);
  }, [modelIds, target]);

  const ranked = React.useMemo(() => {
    if (!data || !target) return [] as Array<{ id: string; similarity: number; coverage: number | null; capability: number | null; score: number }>;
    const sims = data.similarity[target] || {};
    // Normalize weights: coverageWeight = 1 - alpha - capWeight (clamped to >=0)
    const wSim = Math.max(0, Math.min(1, alpha));
    const wCap = Math.max(0, Math.min(1, capWeight));
    const wCov = Math.max(0, 1 - wSim - wCap);
    return Object.keys(data.models)
      .filter(id => id !== target)
      .map(id => {
        const sim = sims[id]?.score ?? 0;
        const cov = data.models[id]?.averageHybrid ?? null;
        const capRec = capability ? (data.capabilityScores?.[id]?.[capability] ?? null) : null;
        const cap = (capRec && capRec.contributingRuns >= minCapRuns) ? (capRec.score ?? null) : null;
        const score = (wSim * sim)
          + (wCov * (cov ?? 0))
          + (wCap * (cap ?? 0));
        return { id, similarity: sim, coverage: cov, capability: cap, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }, [data, target, alpha, capWeight, capability, minCapRuns]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Model Vibes</h1>
      {loading && <div className="text-sm text-muted-foreground">Loading vibes index…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      {data && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Vibe map (size = coverage; links = strongest similarities). Color reflects selected capability if set.</div>
          <VibeMap
            data={data}
            selected={target}
            onSelect={setTarget}
            alpha={alpha}
            capability={capability}
            capabilityMinRuns={minCapRuns}
            capabilityWeight={capWeight}
            onDebug={(msg) => {
              // eslint-disable-next-line no-console
              console.log('[VibesPage] debug', msg);
            }}
          />
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <div className="text-sm font-medium">Target model (vibe)</div>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select model" />
            </SelectTrigger>
            <SelectContent>
              {modelIds.map(id => (
                <SelectItem key={id} value={id}>{id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 md:col-span-2">
          <div className="flex justify-between text-sm font-medium">
            <span>Blend</span>
            <span>Sim {Math.round(alpha * 100)}% / Cap {Math.round(capWeight * 100)}% / Cov {Math.round(Math.max(0, 100 - (alpha * 100 + capWeight * 100)))}%</span>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">Similarity weight</div>
            <Slider value={[alpha]} onValueChange={(v) => setAlpha(v[0] ?? 0.5)} min={0} max={1} step={0.05} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Capability</div>
              <div className="w-56">
                <Select value={capability} onValueChange={setCapability}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select capability" /></SelectTrigger>
                  <SelectContent>
                    {capabilityIds.map(id => (
                      <SelectItem key={id} value={id}>{id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Slider value={[capWeight]} onValueChange={(v) => setCapWeight(v[0] ?? 0)} min={0} max={1} step={0.05} />
            {capability && (
              <div className="flex items-center gap-4">
                <div className="text-xs text-muted-foreground">Min runs for capability</div>
                <div className="flex-1">
                  <Slider value={[minCapRuns]} onValueChange={(v) => setMinCapRuns(Math.round(v[0] ?? 3))} min={0} max={10} step={1} />
                </div>
                <div className="text-xs w-8 text-right">{minCapRuns}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">Top matches</div>
        {capability && (
          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">Capability scale</div>
            <div className="h-2 flex-1 rounded" style={{
              background: 'linear-gradient(90deg, hsl(0,70%,50%) 0%, hsl(60,70%,50%) 50%, hsl(120,70%,50%) 100%)'
            }} />
            <div className="text-xs text-muted-foreground">low</div>
            <div className="text-xs text-muted-foreground">high</div>
          </div>
        )}
        <div className="divide-y rounded-md border">
          {ranked.map((row) => (
            <div key={row.id} className="flex items-center justify-between p-3">
              <div className="font-medium">{row.id}</div>
              <div className="text-sm text-muted-foreground flex gap-4">
                <span>Similarity: {row.similarity?.toFixed(3)}</span>
                <span>Coverage: {row.coverage !== null ? row.coverage.toFixed(3) : '—'}</span>
                {capability && <span>Capability: {row.capability !== null ? row.capability.toFixed(3) : '—'}</span>}
                <span>Composite: {row.score.toFixed(3)}</span>
              </div>
            </div>
          ))}
          {ranked.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">No data yet. Run the vibes index CLI.</div>
          )}
        </div>
      </div>
    </div>
  );
}


