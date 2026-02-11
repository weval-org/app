'use client';

import React from 'react';

interface WorkerReliabilityChartProps {
  high: number;
  medium: number;
  low: number;
}

export function WorkerReliabilityChart({ high, medium, low }: WorkerReliabilityChartProps) {
  const total = high + medium + low;
  const highPct = Math.round((high / total) * 100);
  const mediumPct = Math.round((medium / total) * 100);
  const lowPct = Math.round((low / total) * 100);

  const segments = [
    { label: 'High reliability', count: high, pct: highPct, color: 'bg-emerald-500' },
    { label: 'Medium reliability', count: medium, pct: mediumPct, color: 'bg-amber-500' },
    { label: 'Low reliability', count: low, pct: lowPct, color: 'bg-muted-foreground' },
  ];

  return (
    <div className="bg-muted/30 rounded-xl p-4 sm:p-6 border border-border">
      <h3 className="font-semibold text-base sm:text-lg mb-4">Worker Reliability Distribution</h3>

      <p className="text-sm text-muted-foreground mb-4">
        We scored workers on consistency, variance, and cross-criterion agreement to assess reliability.
      </p>

      {/* Stacked bar */}
      <div
        className="h-8 rounded-lg overflow-hidden flex mb-4"
        role="img"
        aria-label={`Reliability distribution: ${highPct}% high, ${mediumPct}% medium, ${lowPct}% low`}
      >
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.color} flex items-center justify-center transition-all`}
            style={{ width: `${seg.pct}%` }}
          >
            {seg.pct > 15 && (
              <span className="text-xs font-medium text-white">
                {seg.pct}%
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {segments.map((seg) => (
          <div key={seg.label}>
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <div className={`w-2.5 h-2.5 rounded ${seg.color}`} />
              <span className="text-sm font-medium">{seg.count}</span>
            </div>
            <span className="text-xs text-muted-foreground">{seg.label.split(' ')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
