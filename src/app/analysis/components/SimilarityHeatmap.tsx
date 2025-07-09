'use client'

import React from 'react'
import * as d3 from 'd3';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';

interface SimilarityHeatmapProps {
  similarityMatrix: Record<string, Record<string, number>>
  models: string[]
  onCellClick?: (modelA: string, modelB: string, value: number) => void;
}

// getColorForValue seems to be unused, getRelativeColor is active for cell backgrounds
// const getColorForValue = (value: number): string => { ... };

const getRelativeColor = (value: number, minValue: number, maxValue: number): string => {
  if (isNaN(value) || minValue === maxValue) {
    return 'hsl(var(--muted-foreground))'; // Use a theme color for invalid/single value
  }
  const clampedValue = Math.max(minValue, Math.min(value, maxValue));
  const normalizedValue = (clampedValue - minValue) / (maxValue - minValue);
  // Using a red-to-green spectrum. These specific colors are for data viz, less about theme.
  const startColor = { r: 239, g: 68, b: 68 }; // red-500 
  const endColor = { r: 34, g: 197, b: 94 }; // green-500 
  
  const r = Math.round(startColor.r + (endColor.r - startColor.r) * normalizedValue);
  const g = Math.round(startColor.g + (endColor.g - startColor.g) * normalizedValue);
  const b = Math.round(startColor.b + (endColor.b - startColor.b) * normalizedValue);
  const toHex = (c: number) => c.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export default function SimilarityHeatmap({ similarityMatrix, models, onCellClick }: SimilarityHeatmapProps) {
  if (!models || models.length === 0 || !similarityMatrix) {
    return <div className="p-4 text-muted-foreground italic">No similarity data available for visualization.</div>;
  }

  // Find min/max for color scaling, ignoring the perfect diagonal
  let minValue = 1;
  let maxValue = 0;
  models.forEach(m1 => {
      models.forEach(m2 => {
          if (m1 !== m2) {
              const value = similarityMatrix[m1]?.[m2];
              if (typeof value === 'number' && !isNaN(value)){
                 minValue = Math.min(minValue, value);
                 maxValue = Math.max(maxValue, value);
              }
          }
      });
  });

  // Handle edge cases where all values are the same or no values are found
  if (minValue > maxValue) {
      minValue = 0;
      maxValue = 1;
  }

  const colorScale = d3.scaleSequential(d3.interpolateYlGnBu).domain([minValue, maxValue]);

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-xs text-muted-foreground dark:text-slate-400">
            Cell values range from {minValue.toFixed(3)} to {maxValue.toFixed(3)}
          </p>
        </div>
        <div className="flex items-center space-x-1 text-xs text-muted-foreground dark:text-slate-300">
          <span>Lower</span>
          <div className="flex h-3 rounded-sm overflow-hidden ring-1 ring-border dark:ring-slate-600">
            {Array.from({ length: 10 }).map((_, i) => {
               const val = minValue + (maxValue - minValue) * (i / 9);
               return <div key={i} className="w-2.5" style={{ backgroundColor: colorScale(val) }} title={`${val.toFixed(2)}`} />
            })}
          </div>
          <span>Higher</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md ring-1 ring-border dark:ring-slate-700">
        <table className="border-collapse w-full text-[10px]">
          <thead>
            <tr>
              <th className="border-r border-border dark:border-slate-700 p-2 sticky left-0 bg-card dark:bg-slate-800 z-10 w-24 min-w-[96px] text-card-foreground dark:text-slate-100"></th>
              {models.map((colModel) => (
                <th
                  key={colModel}
                  className="p-2 text-left font-normal align-middle text-card-foreground dark:text-slate-200"
                  title={getModelDisplayLabel(colModel)}
                >
                  <div style={{ transform: 'rotate(-45deg)', transformOrigin: 'left bottom', whiteSpace: 'nowrap', width: '15px' }}>
                    {getModelDisplayLabel(colModel)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((rowModel, i) => (
              <tr key={rowModel}>
                <th
                  className="border-r border-border dark:border-slate-700 p-2 text-right sticky left-0 bg-card dark:bg-slate-800 z-10 whitespace-nowrap w-24 min-w-[96px] font-medium text-card-foreground dark:text-slate-200"
                  scope="row"
                  title={getModelDisplayLabel(rowModel)}
                >
                  {getModelDisplayLabel(rowModel)}
                </th>
                {models.map((colModel, j) => {
                  // Only render the lower triangle and the diagonal
                  if (j > i) {
                    return <td key={`${rowModel}-${colModel}`} className="border-l border-border dark:border-slate-700 bg-card dark:bg-background"></td>;
                  }
                  
                  const value = similarityMatrix[rowModel]?.[colModel] ?? NaN;
                  const bgColor = !isNaN(value) ? colorScale(value) : 'hsl(var(--muted))';
                  const isClickable = !isNaN(value) && !!onCellClick && rowModel !== colModel;

                  return (
                    <td
                      key={`${rowModel}-${colModel}`}
                      className={`border-l border-border dark:border-slate-700 p-1.5 text-center font-medium ${isClickable ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''}`}
                      style={{
                        backgroundColor: bgColor,
                        minWidth: '40px',
                      }}
                      title={`${getModelDisplayLabel(rowModel)} vs ${getModelDisplayLabel(colModel)}: ${!isNaN(value) ? value.toFixed(3) : 'N/A'}`}
                      onClick={() => {
                          if (isClickable) {
                              onCellClick(rowModel, colModel, value);
                          }
                      }}
                    >
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 