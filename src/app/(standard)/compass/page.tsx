"use client";
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { extractMakerFromModelId, getModelDisplayLabel } from '@/app/utils/modelIdUtils';

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
  const [viewMode, setViewMode] = React.useState<'sliders' | 'spider'>('sliders');

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/compass');
        if (mounted) {
          if (res.ok) {
            const json: CompassIndex = await res.json();
            console.log('Compass data loaded:', json);
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

    const info = compass.axes?.['abstraction'];
    const inter = compass.axes?.['proactivity'];
    if (!info || !inter) {
      console.warn('Axis data for scatter plot not found. Need "abstraction" and "proactivity".', {
        availableAxes: Object.keys(compass.axes || {}),
      });
      return [];
    }

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
    console.log('Processed points for scatter plot:', finalPoints);
    return finalPoints;
  }, [compass]);

  const explorerModels = React.useMemo(() => {
    if (!compass?.axes || !compass?.axisMetadata) return [];
    
    const allModelIds = new Set<string>();
    Object.values(compass.axes).forEach(axisData => {
      Object.keys(axisData).forEach(modelId => allModelIds.add(modelId));
    });

    const models = Array.from(allModelIds).map(id => {
      const hasData = Object.values(compass.axisMetadata!).some(axis => {
        const modelAxisData = compass.axes?.[axis.id]?.[id];
        return modelAxisData && modelAxisData.runs >= 3 && modelAxisData.value !== null;
      });
      
      if (hasData) {
        return {
          id,
          maker: extractMakerFromModelId(id),
        };
      }
      return null;
    }).filter(Boolean);

    return models as { id: string, maker: string }[];
  }, [compass]);

  const [hover, setHover] = React.useState<Point | null>(null);

  const axisRanges = React.useMemo(() => {
    if (!compass?.axes || !compass?.axisMetadata) return {};
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const axis of Object.values(compass.axisMetadata)) {
      const axisData = compass.axes[axis.id];
      if (!axisData) continue;
      const values = Object.values(axisData)
        .map(d => d.value)
        .filter((v): v is number => v !== null && typeof v === 'number' && isFinite(v));
      if (values.length > 0) {
        ranges[axis.id] = { min: Math.min(...values), max: Math.max(...values) };
      }
    }
    return ranges;
  }, [compass]);

  const xAxis = compass?.axisMetadata?.['abstraction'];
  const yAxis = compass?.axisMetadata?.['proactivity'];

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
          <h2 className="text-2xl font-semibold">Model Explorer</h2>
          <p className="text-muted-foreground">
            Explore individual model scores across all behavioral axes.
          </p>
        </div>

        <div className="flex items-center space-x-2 mb-6">
          <button
            onClick={() => setViewMode('sliders')}
            className={`px-3 py-1 text-sm rounded-md ${viewMode === 'sliders' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            Sliders
          </button>
          <button
            onClick={() => setViewMode('spider')}
            className={`px-3 py-1 text-sm rounded-md ${viewMode === 'spider' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            Spider
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {explorerModels.map(model => (
            <Card key={model.id}>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: makerColorMap[model.maker] || makerColorMap.UNKNOWN }}
                  />
                  <span>{getModelDisplayLabel(model.id, { prettifyModelName: true, hideProvider: true })}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                {viewMode === 'sliders' ? (
                  <>
                    {compass?.axisMetadata && Object.values(compass.axisMetadata).map(axis => {
                      const axisData = compass?.axes[axis.id];
                      if (!axisData) return null;

                      const modelData = axisData[model.id];
                      const value = modelData?.value;
                      const runs = modelData?.runs ?? 0;

                      if (value === null || typeof value !== 'number' || !isFinite(value) || runs < 3) {
                        return (
                          <div key={axis.id}>
                            <p className="text-sm font-semibold text-center mb-1 capitalize">{axis.id.replace(/_/g, ' ').replace(/-/g, ' ')}</p>
                            <div className="h-6 flex items-center justify-center text-center text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 rounded">
                              Not enough data
                            </div>
                          </div>
                        );
                      }

                      const range = axisRanges[axis.id];
                      let normalizedValue = 0.5;
                      if (range && range.max - range.min > 1e-6) {
                        normalizedValue = (value - range.min) / (range.max - range.min);
                      }

                      return (
                        <div key={axis.id}>
                           <p className="text-sm font-semibold text-center mb-1 capitalize">{axis.id.replace(/_/g, ' ').replace(/-/g, ' ')}</p>
                           <div className="flex items-center space-x-2">
                            <span className="text-xs text-muted-foreground w-20 text-right capitalize">{axis.negativePole}</span>
                            <div
                              className="w-full h-2 rounded-full relative group"
                              style={{
                                background: 'linear-gradient(to right, hsl(var(--compass-pole-neg)), hsl(var(--compass-pole-pos)))',
                              }}
                            >
                              <div
                                className="absolute -top-1 h-4 w-4 rounded-full border-2 border-primary bg-background ring-1 ring-inset ring-border"
                                style={{
                                  left: `${normalizedValue * 100}%`,
                                  transform: 'translateX(-50%)',
                                }}
                              />
                               <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max max-w-xs bg-popover text-popover-foreground rounded-md shadow-lg p-2 text-xs z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <p>Score: {value.toFixed(3)}</p>
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground w-20 text-left capitalize">{axis.positivePole}</span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                ) : (
                  <SpiderChart model={model} compass={compass} axisRanges={axisRanges} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

const SpiderChart = ({ model, compass, axisRanges }: { model: { id: string, maker: string }, compass: CompassIndex | null, axisRanges: Record<string, { min: number, max: number }> }) => {
  const chartSize = 200;
  const center = chartSize / 2;
  const [hoveredAxis, setHoveredAxis] = React.useState<string | null>(null);

  const chartData = React.useMemo(() => {
    if (!compass?.axisMetadata || !compass?.axes) return { points: [], labels: [] };

    const axes = Object.values(compass.axisMetadata);
    const numAxes = axes.length;
    const angleSlice = (Math.PI * 2) / numAxes;

    const labels = axes.map((axis, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const x = center + (center - 20) * Math.cos(angle);
      const y = center + (center - 20) * Math.sin(angle);
      return { ...axis, x, y };
    });

    const maxRadius = center * 0.8;
    const midlineRadius = maxRadius / 2;

    const points = axes.map((axis, i) => {
      const modelData = compass.axes[axis.id]?.[model.id];
      let normalizedValue = 0.5;
      if (modelData && modelData.value !== null && typeof modelData.value === 'number' && modelData.runs >=3) {
        const range = axisRanges[axis.id];
        if (range && range.max - range.min > 1e-6) {
          normalizedValue = (modelData.value - range.min) / (range.max - range.min);
        }
      }
      
      const radius = midlineRadius + (normalizedValue - 0.5) * maxRadius;
      const angle = angleSlice * i - Math.PI / 2;
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      return { x, y, axisId: axis.id, value: modelData?.value };
    });

    return { points, labels, midlineRadius };
  }, [compass, model.id, axisRanges]);

  const color = makerColorMap[model.maker] || makerColorMap.UNKNOWN;

  const pointString = chartData.points.map(p => `${p.x},${p.y}`).join(' ');

  const hoveredData = hoveredAxis ? Object.values(compass?.axisMetadata || {}).find(a => a.id === hoveredAxis) : null;
  const hoveredValue = hoveredAxis ? compass?.axes?.[hoveredAxis]?.[model.id]?.value : null;

  return (
    <div className="relative w-full aspect-square flex items-center justify-center">
      <svg viewBox={`0 0 ${chartSize} ${chartSize}`}>
        {/* Concentric circles */}
        {[0.25, 0.75, 1].map(r => (
          <circle key={r} cx={center} cy={center} r={(center * 0.8 / 2) * r * 2} fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" />
        ))}
        {/* Midline */}
        {chartData.midlineRadius && (
          <circle cx={center} cy={center} r={chartData.midlineRadius} fill="none" stroke="hsl(var(--primary))" strokeWidth="0.5" strokeDasharray="2 2" />
        )}
        {/* Axis lines */}
        {chartData.labels.map((label, i) => (
          <line key={label.id} x1={center} y1={center} x2={chartData.labels[i].x} y2={chartData.labels[i].y} stroke="hsl(var(--border))" strokeWidth="0.5" />
        ))}
        {/* Data shape */}
        <polygon points={pointString} fill={color} fillOpacity="0.3" stroke={color} strokeWidth="2" />
        {/* Data points */}
        {chartData.points.map((p, i) => (
          <circle
            key={chartData.labels[i].id}
            cx={p.x}
            cy={p.y}
            r="3"
            fill={color}
            onMouseEnter={() => setHoveredAxis(chartData.labels[i].id)}
            onMouseLeave={() => setHoveredAxis(null)}
          />
        ))}
        {/* Axis labels */}
        {chartData.labels.map(label => (
          <text
            key={label.id}
            x={label.x}
            y={label.y}
            textAnchor={Math.abs(label.x - center) < 1 ? 'middle' : label.x > center ? 'start' : 'end'}
            dominantBaseline="middle"
            fontSize="8"
            className="fill-muted-foreground capitalize"
          >
            {label.id.replace(/_/g, ' ').replace(/-/g, ' ')}
          </text>
        ))}
      </svg>
      {hoveredAxis && hoveredData && (
        <div className="absolute top-0 right-0 bg-popover p-2 rounded-md shadow-lg text-xs border">
          <p className="font-bold capitalize">{hoveredData.id.replace(/_/g, ' ').replace(/-/g, ' ')}</p>
          <p>Score: {typeof hoveredValue === 'number' ? hoveredValue.toFixed(3) : 'N/A'}</p>
          <p className="text-muted-foreground">{`${hoveredData.negativePole} ↔ ${hoveredData.positivePole}`}</p>
        </div>
      )}
    </div>
  );
};


