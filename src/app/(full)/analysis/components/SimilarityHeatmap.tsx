'use client'

import React from 'react'
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

  let minValue = Infinity;
  let maxValue = -Infinity;
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

  if (!isFinite(minValue) || !isFinite(maxValue)) {
      minValue = 0; 
      maxValue = 1;
  } else if (minValue === maxValue) {
      minValue = Math.max(0, minValue - 0.01); 
      maxValue = Math.min(1, maxValue + 0.01);
  }

  return (
    <div className="space-y-3">
      {/* Title and Min/Max for context within this component might be redundant if CardHeader provides it */}
      {/* For now, styling it to fit dark theme if it were to be kept or repurposed */}
      <div className="flex justify-between items-center">
        <div>
          {/* <h3 className="text-md font-semibold text-foreground dark:text-slate-200">Similarity Details</h3> */}
          <p className="text-xs text-muted-foreground dark:text-slate-400">
            Cell values range from {minValue.toFixed(3)} to {maxValue.toFixed(3)}
          </p>
        </div>
        <div className="flex items-center space-x-1 text-xs text-muted-foreground dark:text-slate-300">
          <span>Lower</span>
          <div className="flex h-3 rounded-sm overflow-hidden ring-1 ring-border dark:ring-slate-600">
            {Array.from({ length: 10 }).map((_, i) => {
               const val = minValue + (maxValue - minValue) * (i / 9);
               return (
                <div
                 key={i}
                 className="w-2.5"
                 style={{ backgroundColor: getRelativeColor(val, minValue, maxValue) }}
                 title={`${val.toFixed(2)}`}
                />
               )
            })}
          </div>
          <span>Higher</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md ring-1 ring-border dark:ring-slate-700">
        <table className="border-collapse w-full text-[10px]">
          <thead>
            <tr>
              <th className="border border-border dark:border-slate-700 p-2 sticky left-0 bg-card dark:bg-slate-800 z-10 w-24 min-w-[96px] text-card-foreground dark:text-slate-100"></th>
              {models.map((colModel) => (
                <th
                  key={colModel}
                  className="border border-border dark:border-slate-700 p-2 text-center font-semibold align-middle text-card-foreground dark:text-slate-200 bg-muted/70 dark:bg-slate-800/70 backdrop-blur-sm"
                  title={getModelDisplayLabel(colModel)}
                >
                  {getModelDisplayLabel(colModel)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((rowModel) => (
              <tr key={rowModel}>
                <th
                  className="border border-border dark:border-slate-700 p-2 text-right sticky left-0 bg-card dark:bg-slate-800 z-10 whitespace-nowrap w-24 min-w-[96px] font-medium text-card-foreground dark:text-slate-200"
                  scope="row"
                  title={getModelDisplayLabel(rowModel)}
                >
                  {getModelDisplayLabel(rowModel)}
                </th>
                {models.map((colModel) => {
                  const value = similarityMatrix[rowModel]?.[colModel] ?? NaN;
                  const bgColor = getRelativeColor(value, minValue, maxValue);
                  const r = parseInt(bgColor.slice(1, 3), 16);
                  const g = parseInt(bgColor.slice(3, 5), 16);
                  const b = parseInt(bgColor.slice(5, 7), 16);
                  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                  // Text color decision based on background brightness. These specific hex values are okay for now.
                  // Ideally, these could be CSS variables if more complex theming of this specific text is needed.
                  const textColor = brightness > 128 ? '#111827' : '#f8fafc'; // Tailwind gray-900 or gray-50. Chosen for high contrast.
                  const isClickable = !isNaN(value) && !!onCellClick && rowModel !== colModel;

                  return (
                    <td
                      key={`${rowModel}-${colModel}`}
                      className={`border border-border dark:border-slate-700 p-1.5 text-center font-medium ${isClickable ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''}`}
                      style={{
                        backgroundColor: bgColor,
                        color: textColor,
                        minWidth: '40px', // Slightly wider for readability
                      }}
                      title={`${getModelDisplayLabel(rowModel)} vs ${getModelDisplayLabel(colModel)}: ${!isNaN(value) ? value.toFixed(3) : 'N/A'}`}
                      onClick={() => {
                          if (isClickable) {
                              onCellClick(rowModel, colModel, value);
                          }
                      }}
                    >
                      {!isNaN(value) ? value.toFixed(3) : '-'}
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