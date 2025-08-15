"use client";
import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { extractMakerFromModelId, getModelDisplayLabel } from '@/app/utils/modelIdUtils';

type VibesIndex = {
  models: Record<string, { averageHybrid: number | null; totalRuns: number; uniqueConfigs: number }>;
  capabilityScores?: Record<string, Record<string, { score: number | null; contributingRuns: number }>>;
  generatedAt: string;
};

type CompassIndex = {
  axes: Record<string, Record<string, { value: number | null; runs: number }>>;
  axisMetadata?: Record<string, { id:string; positivePole: string; negativePole: string }>;
  generatedAt: string;
};

const makerColorMap: Record<string, string> = {
  OPENAI: '#10a37f',
  ANTHROPIC: '#d97706',
  GOOGLE: '#4285F4',
  META: '#0c87ef',
  MISTRALAI: '#ff7f0e',
  DEEPSEEK: '#8B5CF6',
  XAI: '#171717',
  COHERE: '#db2777',
  'Z-AI': '#0ea5e9', // for openrouter:z-ai/glm-4.5
  MOONSHOT: '#5eead4',
  UNKNOWN: '#9ca3af',
};

type Point = {
  id: string;
  x: number | null;
  y: number | null;
  xValid: boolean;
  yValid: boolean;
  runs: number;
  maker: string;
};

export default function CompassPage() {
  const [compass, setCompass] = React.useState<CompassIndex | null>(null);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/compass');
        if (mounted) {
          if (res.ok) {
            const json: CompassIndex = await res.json();
            setCompass(json);
          } else {
            setError('Failed to load compass data');
          }
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const points = React.useMemo<Point[]>(() => {
    if (!compass) return [];

    const allModelIds = new Set<string>();
    Object.values(compass.axes).forEach(axisData => {
      Object.keys(axisData).forEach(modelId => allModelIds.add(modelId));
    });

    const info = compass.axes?.['info_style'];
    const inter = compass.axes?.['interaction_style'];
    if (!info || !inter) return [];

    let base = Array.from(allModelIds).map(id => {
      const xRec = info[id];
      const yRec = inter[id];
      const xRaw = (xRec && typeof xRec.value === 'number') ? xRec.value : null;
      const yRaw = (yRec && typeof yRec.value === 'number') ? yRec.value : null;
      const xRuns = xRec?.runs ?? 0;
      const yRuns = yRec?.runs ?? 0;
      const xValid = xRuns >= 3 && xRaw !== null;
      const yValid = yRuns >= 3 && yRaw !== null;
      // Map 0..1 -> -1..1 centered
      const x = xRaw !== null ? (xRaw - 0.5) * 2 : null;
      const y = yRaw !== null ? (yRaw - 0.5) * 2 : null;
      return {
        id,
        x,
        y,
        xValid,
        yValid,
        runs: Math.min(xRuns, yRuns),
        maker: extractMakerFromModelId(id),
      };
    });
    const xs = base.filter(p => typeof p.x === 'number').map(p => p.x as number);
    const ys = base.filter(p => typeof p.y === 'number').map(p => p.y as number);
    const xMin = xs.length ? Math.min(...xs) : -1;
    const xMax = xs.length ? Math.max(...xs) : 1;
    const yMin = ys.length ? Math.min(...ys) : -1;
    const yMax = ys.length ? Math.max(...ys) : 1;
    const scale = (v: number | null, min: number, max: number) => {
      if (v === null) return null;
      if (max - min < 1e-6) return 0; // collapse to center when no spread
      const t = (v - min) / (max - min); // 0..1
      return t * 2 - 1; // -1..1
    };
    const finalPoints = base.map(p => ({
      ...p,
      x: scale(p.x, xMin, xMax),
      y: scale(p.y, yMin, yMax),
    }));
    return finalPoints;
  }, [compass]);

  const [hover, setHover] = React.useState<Point | null>(null);

  const xAxis = compass?.axisMetadata?.['info_style'];
  const yAxis = compass?.axisMetadata?.['interaction_style'];

  const width = 900;
  const height = 520;
  const pad = 36;

  const centerX = width / 2;
  const centerY = height / 2;
  const xToPx = (v: number) => centerX + v * ((width - pad * 2) / 2);
  const yToPx = (v: number) => centerY - v * ((height - pad * 2) / 2);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Behavioral Compass</h1>
        <p className="text-muted-foreground">An interactive visualization of model behaviors along key personality axes.</p>
      </div>

      {loading && <div className="text-sm text-muted-foreground">Loading index…</div>}
      {error && <div className="text-sm text-red-600">{error}</div>}
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          {/* Scatter */}
          <div className="relative">
            <svg width={width} height={height} className="w-full h-auto bg-card rounded-md border" viewBox={`0 0 ${width} ${height}`}>
              {/* Crosshairs centered */}
              <line x1={centerX} y1={pad} x2={centerX} y2={height - pad} stroke="hsl(var(--border))" strokeWidth={1} />
              <line x1={pad} y1={centerY} x2={width - pad} y2={centerY} stroke="hsl(var(--border))" strokeWidth={1} />
              
              {/* Side labels */}
              {yAxis && <>
                <text x={centerX} y={pad - 12} textAnchor="middle" fontSize={14} className="fill-foreground font-semibold">{yAxis.positivePole}</text>
                <text x={centerX} y={height - pad + 20} textAnchor="middle" fontSize={14} className="fill-foreground font-semibold">{yAxis.negativePole}</text>
              </>}
              {xAxis && <>
                <text x={pad - 24} y={centerY} textAnchor="middle" dominantBaseline="middle" fontSize={14} className="fill-foreground font-semibold" transform={`rotate(-90, ${pad - 24}, ${centerY})`}>{xAxis.negativePole}</text>
                <text x={width - pad + 24} y={centerY} textAnchor="middle" dominantBaseline="middle" fontSize={14} className="fill-foreground font-semibold" transform={`rotate(90, ${width - pad + 24}, ${centerY})`}>{xAxis.positivePole}</text>
              </>}

              {/* Points */}
              {points.map(p => {
                const x = p.x;
                const y = p.y;
                const valid = p.xValid && p.yValid;
                const r = 8; // was pointSize

                if (x === null || y === null) {
                  return null;
                }
                
                const color = makerColorMap[p.maker] || makerColorMap.UNKNOWN;
                const fill = color;
                const opacity = valid ? 1.0 : 0.4;

                const px = xToPx(Math.max(-1, Math.min(1, x)));
                const py = yToPx(Math.max(-1, Math.min(1, y)));
                return (
                  <g key={p.id}
                     onMouseEnter={() => setHover(p)}
                     onMouseLeave={() => setHover(null)}
                     opacity={hover && hover.id !== p.id ? 0.3 : 1}
                     className="transition-opacity"
                  >
                    <circle cx={px} cy={py} r={r} fill={fill} fillOpacity={opacity} stroke="hsl(var(--card-foreground))" strokeOpacity={0.2} />
                    <text x={px > centerX ? px - r - 4 : px + r + 4} y={py + 4} textAnchor={px > centerX ? 'end' : 'start'} fontSize={11} fontWeight="500" className="fill-foreground pointer-events-none">{getModelDisplayLabel(p.id, { hideProvider: true, prettifyModelName: true })}</text>
                  </g>
                );
              })}
              {/* Hover tooltip */}
              {hover && (() => {
                const x = hover.x;
                const y = hover.y;
                if (x === null || y === null) return null;
                const px = xToPx(Math.max(-1, Math.min(1, x)));
                const py = yToPx(Math.max(-1, Math.min(1, y)));

                const boxW = 180;
                const boxH = 58;
                const xPos = px > centerX ? px - boxW - 15 : px + 15;
                const yPos = py - boxH / 2;
                
                const info = [
                  `${xAxis ? `${xAxis.positivePole} ↔ ${xAxis.negativePole}` : 'X-Axis'}: ${x.toFixed(2)}`,
                  `${yAxis ? `${yAxis.positivePole} ↔ ${yAxis.negativePole}` : 'Y-Axis'}: ${y.toFixed(2)}`,
                  `Contributing runs: ${hover.runs}`,
                ];

                return (
                  <g className="pointer-events-none" transform={`translate(${xPos}, ${yPos})`}>
                    <rect x="0" y="0" width={boxW} height={boxH} rx="4" fill="hsla(var(--popover), 0.9)" stroke="hsl(var(--border))" />
                    {info.map((line, i) => (
                      <text key={line} x="10" y={20 + i * 15} fontSize="11" className="fill-muted-foreground">{line}</text>
                    ))}
                  </g>
                );
              })()}
            </svg>
          </div>
        </div>
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Legend</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(makerColorMap).map(([maker, color]) => (
                <div key={maker} className="flex items-center space-x-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }}></div>
                  <span className="text-sm capitalize">{maker.toLowerCase()}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-12">
        <div className="space-y-1 mb-6">
          <h2 className="text-2xl font-semibold">Axis Explorer</h2>
          <p className="text-muted-foreground">
            Explore model scores on individual behavioral axes.
          </p>
        </div>
        <div className="space-y-6">
          {compass?.axisMetadata && Object.values(compass.axisMetadata).map(axis => {
            const axisData = compass?.axes[axis.id];
            if (!axisData) return null;

            const models = Object.entries(axisData)
              .map(([id, data]) => {
                if (data.value === null || typeof data.value !== 'number' || !isFinite(data.value)) return null;
                // Filter out models with insufficient data
                const runs = data.runs ?? 0;
                if (runs < 3) return null;

                return {
                  id,
                  value: data.value,
                  runs: data.runs,
                  maker: extractMakerFromModelId(id),
                };
              })
              .filter((m): m is { id: string; value: number; runs: number; maker: string } => m !== null)
              .sort((a, b) => a.value - b.value);

            return (
              <Card key={axis.id}>
                <CardHeader>
                  <CardTitle className="capitalize">{axis.id.replace(/_/g, ' ')}</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="relative h-20 w-full px-24">
                    {/* Axis line */}
                    <div className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 bg-slate-200 dark:bg-slate-700 rounded-full" />
                    
                    {/* Pole labels */}
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-full pr-4 text-sm font-medium text-muted-foreground text-right w-24">{axis.negativePole}</span>
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-4 text-sm font-medium text-muted-foreground text-left w-24">{axis.positivePole}</span>

                    {/* Model points */}
                    <div className="relative w-full h-full">
                      {models.map((model, index) => {
                        const color = makerColorMap[model.maker] || makerColorMap.UNKNOWN;
                        const left = `${model.value * 100}%`;
                        const yOffset = (index % 5 - 2) * 16;

                        return (
                          <div
                            key={model.id}
                            className="absolute top-1/2 group transition-transform duration-200 hover:scale-125"
                            style={{
                              left,
                              transform: `translate(-50%, calc(-50% + ${yOffset}px))`,
                              zIndex: 10,
                            }}
                          >
                            <div
                              className="w-3.5 h-3.5 rounded-full cursor-pointer border-2 border-white dark:border-slate-800"
                              style={{ backgroundColor: color }}
                            />
                            {/* Tooltip */}
                            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max max-w-xs bg-popover text-popover-foreground rounded-md shadow-lg p-2 text-xs z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <p className="font-bold">{getModelDisplayLabel(model.id, { prettifyModelName: true, hideProvider: true })}</p>
                              <p>Score: {model.value.toFixed(3)}</p>
                              <p>Runs: {model.runs}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}


