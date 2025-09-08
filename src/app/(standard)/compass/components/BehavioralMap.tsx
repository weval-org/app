"use client";
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { extractMakerFromModelId, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { MAKER_COLORS } from '@/app/utils/makerColors';
import { Maximize2, RotateCcw, Layers } from 'lucide-react';

type CompassIndex = {
  axes: Record<string, Record<string, { value: number | null; runs: number }>>;
  axisMetadata?: Record<string, { id: string; positivePole: string; negativePole: string }>;
  exemplars?: Record<string, any>;
  generatedAt: string;
};

type PersonalityProfile = {
  modelId: string;
  maker: string;
  displayName: string;
  dominantTraits: Array<{ trait: string; score: number; confidence: number }>;
  allTraits: Array<{ trait: string; score: number; confidence: number; runs: number }>;
  overallScore: number;
  dataQuality: 'high' | 'medium' | 'low';
  totalRuns: number;
};

type TraitDefinition = {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  examples: { high: string; low: string };
  color: string;
};

interface BehavioralMapProps {
  compass: CompassIndex;
  traitDefinitions: Record<string, TraitDefinition>;
  profiles: PersonalityProfile[];
}

type Point = {
  id: string;
  x: number | null;
  y: number | null;
  xValid: boolean;
  yValid: boolean;
  runs: number;
  maker: string;
  displayName: string;
  profile?: PersonalityProfile;
};

const BehavioralMap = React.memo(function BehavioralMap({ compass, traitDefinitions, profiles }: BehavioralMapProps) {
  const [xAxisId, setXAxisId] = React.useState<string>('abstraction');
  const [yAxisId, setYAxisId] = React.useState<string>('proactivity');
  const [hoveredPoint, setHoveredPoint] = React.useState<Point | null>(null);

  const availableAxes = React.useMemo(() => {
    if (!compass.axisMetadata) return [];
    return Object.values(compass.axisMetadata).filter(axis => 
      compass.axes[axis.id] && Object.keys(compass.axes[axis.id]).length > 0
    );
  }, [compass]);

  // Ensure default selections are valid
  React.useEffect(() => {
    if (availableAxes.length > 0) {
      const validXAxis = availableAxes.find(axis => axis.id === xAxisId);
      const validYAxis = availableAxes.find(axis => axis.id === yAxisId);
      
      if (!validXAxis) {
        setXAxisId(availableAxes[0].id);
      }
      if (!validYAxis) {
        const yAxisCandidate = availableAxes.find(a => a.id !== (validXAxis ? xAxisId : availableAxes[0].id));
        setYAxisId(yAxisCandidate?.id || availableAxes[Math.min(1, availableAxes.length - 1)].id);
      }
    }
  }, [availableAxes, xAxisId, yAxisId]);

  const points = React.useMemo<Point[]>(() => {
    if (!compass || !xAxisId || !yAxisId) return [];

    const xAxisData = compass.axes?.[xAxisId];
    const yAxisData = compass.axes?.[yAxisId];
    if (!xAxisData || !yAxisData) return [];

    // Create profile lookup map for O(1) access
    const profileMap = new Map(profiles.map(p => [p.modelId, p]));
    
    // Get intersection of model IDs that exist in both axes
    const xModelIds = new Set(Object.keys(xAxisData));
    const yModelIds = new Set(Object.keys(yAxisData));
    const commonModelIds = Array.from(xModelIds).filter(id => yModelIds.has(id));

    const basePoints: Point[] = [];
    const validValues: { x: number; y: number }[] = [];

    // Single pass to build points and collect valid values
    for (const id of commonModelIds) {
      const xRec = xAxisData[id];
      const yRec = yAxisData[id];
      const xRaw = (xRec && typeof xRec.value === 'number') ? xRec.value : null;
      const yRaw = (yRec && typeof yRec.value === 'number') ? yRec.value : null;
      const xRuns = xRec?.runs ?? 0;
      const yRuns = yRec?.runs ?? 0;
      const xValid = xRaw !== null;
      const yValid = yRaw !== null;
      
      const point: Point = {
        id,
        x: xRaw,
        y: yRaw,
        xValid,
        yValid,
        runs: Math.min(xRuns, yRuns),
        maker: extractMakerFromModelId(id),
        displayName: getModelDisplayLabel(id, { hideProvider: true, prettifyModelName: true }),
        profile: profileMap.get(id)
      };
      
      basePoints.push(point);
      
      if (xRaw !== null && yRaw !== null) {
        validValues.push({ x: xRaw, y: yRaw });
      }
    }

    if (validValues.length === 0) return basePoints;

    // Calculate min/max more efficiently
    let xMin = validValues[0].x, xMax = validValues[0].x;
    let yMin = validValues[0].y, yMax = validValues[0].y;
    
    for (let i = 1; i < validValues.length; i++) {
      const { x, y } = validValues[i];
      if (x < xMin) xMin = x;
      if (x > xMax) xMax = x;
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }

    // Normalize coordinates
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;
    
    return basePoints.map(p => ({
      ...p,
      x: p.x !== null && xRange > 1e-6 ? ((p.x - xMin) / xRange - 0.5) * 2 : 0,
      y: p.y !== null && yRange > 1e-6 ? ((p.y - yMin) / yRange - 0.5) * 2 : 0,
    }));
  }, [compass, xAxisId, yAxisId, profiles]);

  const xAxis = compass?.axisMetadata?.[xAxisId];
  const yAxis = compass?.axisMetadata?.[yAxisId];
  const xTrait = traitDefinitions[xAxisId];
  const yTrait = traitDefinitions[yAxisId];

  const width = 800;
  const height = 600;
  const padding = 80;
  const centerX = width / 2;
  const centerY = height / 2;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;

  const xToPx = (x: number) => centerX + (x * plotWidth) / 2;
  const yToPx = (y: number) => centerY - (y * plotHeight) / 2;

  const formatAxisName = (axisId: string) => {
    const trait = traitDefinitions[axisId];
    return trait?.name || axisId.replace(/_/g, ' ').replace(/-/g, ' ')
      .split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <Card className="border-0 shadow-lg bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Layers className="w-5 h-5 text-primary" />
              <span>Axis Explorer</span>
            </CardTitle>
            <CardDescription>
              Explore the personality space where AI models cluster and diverge. Choose the axes via the dropdowns below.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Axis Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Horizontal Axis</label>
            <select 
              value={xAxisId} 
              onChange={(e) => setXAxisId(e.target.value)}
              className="w-full p-2 border border-input bg-background rounded-md text-sm"
            >
              {availableAxes.map(axis => (
                <option key={axis.id} value={axis.id}>
                  {formatAxisName(axis.id)} ({axis.negativePole} ↔ {axis.positivePole})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Vertical Axis</label>
            <select 
              value={yAxisId} 
              onChange={(e) => setYAxisId(e.target.value)}
              className="w-full p-2 border border-input bg-background rounded-md text-sm"
            >
              {availableAxes.map(axis => (
                <option key={axis.id} value={axis.id}>
                  {formatAxisName(axis.id)} ({axis.negativePole} ↔ {axis.positivePole})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Visualization */}
        <div className="relative">
          <svg 
            width="100%" 
            height={height} 
            viewBox={`0 0 ${width} ${height}`} 
            className="border rounded-lg bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-800 dark:to-slate-700"
          >
            {/* Grid Lines */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(var(--border))" strokeWidth="0.5" opacity="0.3"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />

            {/* Axes */}
            <line 
              x1={centerX} y1={padding} 
              x2={centerX} y2={height - padding} 
              stroke="hsl(var(--border))" 
              strokeWidth={2} 
            />
            <line 
              x1={padding} y1={centerY} 
              x2={width - padding} y2={centerY} 
              stroke="hsl(var(--border))" 
              strokeWidth={2} 
            />

            {/* Axis Labels */}
            {yAxis && yTrait && (
              <>
                <text 
                  x={centerX} y={padding - 40} 
                  textAnchor="middle" 
                  className="fill-foreground font-semibold text-sm"
                >
                  {yAxis.positivePole}
                </text>
                <text 
                  x={centerX} y={height - padding + 50} 
                  textAnchor="middle" 
                  className="fill-foreground font-semibold text-sm"
                >
                  {yAxis.negativePole}
                </text>
              </>
            )}
            {xAxis && xTrait && (
              <>
                <text 
                  x={padding - 30} y={centerY} 
                  textAnchor="middle" 
                  dominantBaseline="middle" 
                  className="fill-foreground font-semibold text-sm" 
                  transform={`rotate(-90, ${padding - 30}, ${centerY})`}
                >
                  {xAxis.negativePole}
                </text>
                <text 
                  x={width - padding + 30} y={centerY} 
                  textAnchor="middle" 
                  dominantBaseline="middle" 
                  className="fill-foreground font-semibold text-sm" 
                  transform={`rotate(90, ${width - padding + 30}, ${centerY})`}
                >
                  {xAxis.positivePole}
                </text>
              </>
            )}

            {/* Data Points */}
            {points.map(point => {
              if (point.x === null || point.y === null) return null;
              
              const px = xToPx(point.x);
              const py = yToPx(point.y);
              const isValid = point.xValid && point.yValid;
              const color = MAKER_COLORS[point.maker] || MAKER_COLORS.UNKNOWN;
              const radius = isValid ? 6 : 4;
              const opacity = hoveredPoint && hoveredPoint.id !== point.id ? 0.3 : 1;

              return (
                <g key={point.id}>
                  <circle
                    cx={px}
                    cy={py}
                    r={radius}
                    fill={color}
                    fillOpacity={isValid ? 0.8 : 0.4}
                    stroke="white"
                    strokeWidth={2}
                    opacity={opacity}
                    className="cursor-pointer transition-all duration-200 hover:r-8"
                    onMouseEnter={() => setHoveredPoint(point)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                  {isValid && (
                    <text
                      x={px}
                      y={py - 12}
                      textAnchor="middle"
                      className="fill-foreground text-xs font-medium pointer-events-none"
                      opacity={opacity}
                    >
                      {point.displayName}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Hover Tooltip */}
            {hoveredPoint && hoveredPoint.x !== null && hoveredPoint.y !== null && (
              <g>
                <rect
                  x={xToPx(hoveredPoint.x) + 15}
                  y={yToPx(hoveredPoint.y) - 40}
                  width={200}
                  height={70}
                  rx={8}
                  fill="hsl(var(--popover))"
                  stroke="hsl(var(--border))"
                  strokeWidth={1}
                  className="drop-shadow-lg"
                />
                <text
                  x={xToPx(hoveredPoint.x) + 25}
                  y={yToPx(hoveredPoint.y) - 20}
                  className="fill-popover-foreground text-sm font-semibold"
                >
                  {hoveredPoint.displayName}
                </text>
                <text
                  x={xToPx(hoveredPoint.x) + 25}
                  y={yToPx(hoveredPoint.y) - 5}
                  className="fill-muted-foreground text-xs"
                >
                  {xTrait?.name}: {((hoveredPoint.x + 1) * 50).toFixed(0)}%
                </text>
                <text
                  x={xToPx(hoveredPoint.x) + 25}
                  y={yToPx(hoveredPoint.y) + 10}
                  className="fill-muted-foreground text-xs"
                >
                  {yTrait?.name}: {((hoveredPoint.y + 1) * 50).toFixed(0)}%
                </text>
              </g>
            )}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 justify-center">
          {Array.from(new Set(points.map(p => p.maker))).map(maker => (
            <div key={maker} className="flex items-center space-x-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: MAKER_COLORS[maker] || MAKER_COLORS.UNKNOWN }}
              />
              <span className="text-sm capitalize">{maker.toLowerCase()}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

export default BehavioralMap;
