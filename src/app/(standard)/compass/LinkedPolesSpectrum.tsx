"use client";
import React from 'react';
import { extractMakerFromModelId } from '@/app/utils/modelIdUtils';
import { getMakerColor } from '@/app/utils/makerColors';

export type CompassIndex = {
  axes: Record<string, Record<string, { value: number | null; runs: number }>>;
  axisMetadata?: Record<string, { id:string; positivePole: string; negativePole: string }>;
  generatedAt: string;
};

type Props = {
  compass: CompassIndex;
  minRuns?: number;
  axisOrder?: string[];
  hoveredMaker?: string | null;
  onMakerHover?: (maker: string | null) => void;
};

// Visualizes per-axis maker averages like PolesSpectrum, but connects the same maker across rows
export default function LinkedPolesSpectrum({ compass, minRuns = 3, axisOrder, hoveredMaker: externalHoveredMaker, onMakerHover }: Props) {
  const [internalHoveredMaker, setInternalHoveredMaker] = React.useState<string | null>(null);
  
  // Use external hover state if provided, otherwise use internal state
  const hoveredMaker = externalHoveredMaker ?? internalHoveredMaker;
  
  const handleMakerHover = (maker: string | null) => {
    if (onMakerHover) {
      onMakerHover(maker);
    } else {
      setInternalHoveredMaker(maker);
    }
  };
  const axes = React.useMemo(() => {
    if (!compass?.axisMetadata) return [] as Array<{ id: string; negativePole: string; positivePole: string }>;
    const list = Object.values(compass.axisMetadata).map(a => ({ id: a.id, negativePole: a.negativePole, positivePole: a.positivePole }));
    if (!axisOrder || axisOrder.length === 0) return list;
    const pos: Record<string, number> = Object.fromEntries(axisOrder.map((id, i) => [id, i]));
    return list.slice().sort((a, b) => (pos[a.id] ?? 1e9) - (pos[b.id] ?? 1e9));
  }, [compass, axisOrder]);

  // Build per-axis maker averages and normalization bounds per axis
  const perAxisData = React.useMemo(() => {
    const result: Array<{
      axisId: string;
      negativePole: string;
      positivePole: string;
      makers: Array<{ maker: string; value: number }>;
      makerModels: Record<string, Array<{ modelId: string; value: number }>>;
      min: number;
      max: number;
    }> = [];
    axes.forEach(axis => {
      const data = compass.axes?.[axis.id];
      if (!data) return;
      const makerToValues = new Map<string, number[]>();
      const makerToModels = new Map<string, Array<{ modelId: string; value: number }>>();
      Object.entries(data).forEach(([modelId, rec]) => {
        if (!rec || rec.value === null || typeof rec.value !== 'number' || rec.runs < minRuns) return;
        const maker = extractMakerFromModelId(modelId);
        if (!makerToValues.has(maker)) makerToValues.set(maker, []);
        makerToValues.get(maker)!.push(rec.value);
        if (!makerToModels.has(maker)) makerToModels.set(maker, []);
        makerToModels.get(maker)!.push({ modelId, value: rec.value });
      });
      const makers = Array.from(makerToValues.entries()).map(([maker, arr]) => ({ maker, value: arr.reduce((a, b) => a + b, 0) / arr.length }));
      const values = makers.map(m => m.value).filter(v => typeof v === 'number' && isFinite(v));
      const min = values.length ? Math.min(...values) : 0;
      const max = values.length ? Math.max(...values) : 1;
      result.push({ axisId: axis.id, negativePole: axis.negativePole, positivePole: axis.positivePole, makers, makerModels: Object.fromEntries(makerToModels.entries()), min, max });
    });
    return result;
  }, [axes, compass, minRuns]);

  // Collect all makers present in any axis
  const makers = React.useMemo(() => {
    const set = new Set<string>();
    perAxisData.forEach(row => row.makers.forEach(m => set.add(m.maker)));
    return Array.from(set);
  }, [perAxisData]);

  const rowHeight = 40;
  const rowGap = 20;
  const leftPad = 140;
  const rightPad = 140;
  const markerWidth = 2;

  const width = 900;
  const height = perAxisData.length * (rowHeight + rowGap) + 20;

  const rowY = (rowIndex: number) => 10 + rowIndex * (rowHeight + rowGap);
  const valueToX = (value: number, min: number, max: number) => {
    const t = max - min > 1e-6 ? (value - min) / (max - min) : 0.5;
    const trackWidth = width - leftPad - rightPad;
    return leftPad + t * trackWidth;
  };

  return (
    <div className="relative">
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="w-full h-auto bg-card rounded-md border">
        {perAxisData.map((row, i) => {
          const y = rowY(i);
          const trackTop = y + (rowHeight / 2) - 4;
          const trackBottom = trackTop + 8;
          return (
            <g key={row.axisId}>
              {/* Gradient track */}
              <rect x={leftPad} y={trackTop} width={width - leftPad - rightPad} height={8} rx={4} fill="url(#grad)" />
              {/* Labels */}
              <text x={leftPad - 8} y={y + rowHeight / 2} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-xs capitalize">{row.negativePole}</text>
              <text x={width - rightPad + 8} y={y + rowHeight / 2} textAnchor="start" dominantBaseline="middle" className="fill-muted-foreground text-xs capitalize">{row.positivePole}</text>
              {/* Markers per maker */}
              {row.makers.map(m => {
                const x = valueToX(m.value, row.min, row.max);
                const isHighlighted = hoveredMaker === null || hoveredMaker === m.maker;
                const opacity = isHighlighted ? 1 : 0.2;
                return (
                  <rect 
                    key={`${row.axisId}-${m.maker}`} 
                    x={x - markerWidth / 2} 
                    y={trackTop - 6} 
                    width={markerWidth} 
                    height={20} 
                    fill={getMakerColor(m.maker)}
                    opacity={opacity}
                    onMouseEnter={() => handleMakerHover(m.maker)}
                    onMouseLeave={() => handleMakerHover(null)}
                    className="cursor-pointer transition-opacity duration-200"
                  />
                );
              })}
            </g>
          );
        })}

        {/* When a maker is hovered, draw faint model-specific connections across rows for that maker */}
        {hoveredMaker && (() => {
          const modelIds = new Set<string>();
          perAxisData.forEach(row => {
            const arr = row.makerModels?.[hoveredMaker];
            if (arr) arr.forEach(m => modelIds.add(m.modelId));
          });
          return Array.from(modelIds).map(modelId => {
            const points: Array<{ x: number; y: number } | null> = perAxisData.map((row, i) => {
              const rec = row.makerModels?.[hoveredMaker]?.find(m => m.modelId === modelId);
              if (!rec) return null;
              return { x: valueToX(rec.value, row.min, row.max), y: rowY(i) + rowHeight / 2 };
            });
            const segments: Array<[number, number, number, number]> = [];
            for (let i = 0; i < points.length - 1; i++) {
              const a = points[i];
              const b = points[i + 1];
              if (a && b) segments.push([a.x, a.y, b.x, b.y]);
            }
            return (
              <g key={`model-links-${hoveredMaker}-${modelId}`}>
                {segments.map((s, idx) => (
                  <line 
                    key={idx} 
                    x1={s[0]} 
                    y1={s[1]} 
                    x2={s[2]} 
                    y2={s[3]} 
                    stroke={getMakerColor(hoveredMaker)} 
                    strokeWidth={1} 
                    strokeOpacity={0.25}
                    onMouseEnter={() => handleMakerHover(hoveredMaker)}
                    onMouseLeave={() => handleMakerHover(null)}
                    className="cursor-pointer transition-all duration-200"
                  />
                ))}
              </g>
            );
          });
        })()}

        {/* Connections across rows for each maker */}
        {makers.map(maker => {
          // collect points per row
          const points: Array<{ x: number; y: number } | null> = perAxisData.map((row, i) => {
            const rec = row.makers.find(m => m.maker === maker);
            if (!rec) return null;
            return { x: valueToX(rec.value, row.min, row.max), y: rowY(i) + rowHeight / 2 };
          });
          // draw path connecting consecutive available points
          const segments: Array<[number, number, number, number]> = [];
          for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if (a && b) segments.push([a.x, a.y, b.x, b.y]);
          }
          
          const isHighlighted = hoveredMaker === null || hoveredMaker === maker;
          const opacity = isHighlighted ? 0.6 : 0.1;
          const strokeWidth = isHighlighted ? 2 : 1;
          
          return (
            <g key={`links-${maker}`}>
              {segments.map((s, idx) => (
                <line 
                  key={idx} 
                  x1={s[0]} 
                  y1={s[1]} 
                  x2={s[2]} 
                  y2={s[3]} 
                  stroke={getMakerColor(maker)} 
                  strokeWidth={strokeWidth} 
                  strokeOpacity={opacity}
                  onMouseEnter={() => handleMakerHover(maker)}
                  onMouseLeave={() => handleMakerHover(null)}
                  className="cursor-pointer transition-all duration-200"
                />
              ))}
            </g>
          );
        })}

        {/* Simple gradient definition */}
        <defs>
          <linearGradient id="grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="hsl(var(--compass-pole-neg))" />
            <stop offset="100%" stopColor="hsl(var(--compass-pole-pos))" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}


