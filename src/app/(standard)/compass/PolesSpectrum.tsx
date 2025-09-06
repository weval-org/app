"use client";
import React from 'react';
import { getModelDisplayLabel, extractMakerFromModelId } from '@/app/utils/modelIdUtils';
import { getMakerColor } from '@/app/utils/makerColors';

export type CompassIndex = {
  axes: Record<string, Record<string, { value: number | null; runs: number }>>;
  axisMetadata?: Record<string, { id:string; positivePole: string; negativePole: string }>;
  generatedAt: string;
};

type Props = {
  compass: CompassIndex;
  minRuns?: number;
  axisOrder?: string[]; // optional ordering of axis ids
};

export function PolesSpectrum({ compass, minRuns = 3, axisOrder }: Props) {
  const axes = React.useMemo(() => {
    if (!compass?.axisMetadata) return [] as Array<{ id: string; negativePole: string; positivePole: string }>;
    const list = Object.values(compass.axisMetadata).map(a => ({ id: a.id, negativePole: a.negativePole, positivePole: a.positivePole }));
    if (!axisOrder || axisOrder.length === 0) return list;
    const pos: Record<string, number> = Object.fromEntries(axisOrder.map((id, i) => [id, i]));
    return list.slice().sort((a, b) => (pos[a.id] ?? 1e9) - (pos[b.id] ?? 1e9));
  }, [compass, axisOrder]);

  return (
    <div className="space-y-6">
      {axes.map(axis => {
        const data = compass.axes?.[axis.id];
        if (!data) return null;
        // Aggregate per maker (average across the maker's models that meet minRuns)
        const makerToValues = new Map<string, number[]>();
        Object.entries(data).forEach(([modelId, rec]) => {
          if (!rec || rec.value === null || typeof rec.value !== 'number' || rec.runs < minRuns) return;
          const maker = extractMakerFromModelId(modelId);
          if (!makerToValues.has(maker)) makerToValues.set(maker, []);
          makerToValues.get(maker)!.push(rec.value);
        });
        const makerEntries = Array.from(makerToValues.entries()).map(([maker, arr]) => ({
          maker,
          value: arr.reduce((a, b) => a + b, 0) / arr.length,
        }));
        // Compute spread across maker averages for normalization
        const values = makerEntries.map(e => e.value).filter(v => typeof v === 'number' && isFinite(v));
        const min = values.length ? Math.min(...values) : 0;
        const max = values.length ? Math.max(...values) : 1;

        return (
          <div key={axis.id} className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="capitalize">{axis.negativePole}</span>
              <span className="capitalize">{axis.positivePole}</span>
            </div>
            <div className="relative h-8 rounded-md bg-muted overflow-hidden">
              {/* Track */}
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, hsl(var(--compass-pole-neg)), hsl(var(--compass-pole-pos)))' }} />
              {/* Markers */}
              {makerEntries.map(entry => {
                const color = getMakerColor(entry.maker);
                const v = values.length && max - min > 1e-6 ? (entry.value - min) / (max - min) : entry.value; // normalize to 0..1 within spread if available
                const left = `${Math.max(0, Math.min(1, v)) * 100}%`;
                return (
                  <div key={`${axis.id}-${entry.maker}`} className="absolute top-0 bottom-0" style={{ left }}>
                    <div className="h-full w-[2px]" style={{ backgroundColor: color }} title={`${entry.maker} • ${entry.value?.toFixed(3)}`} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default PolesSpectrum;


