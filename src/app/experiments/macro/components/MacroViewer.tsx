'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

// Tiled mode removed; flat-only viewer

// Component state
export default function MacroViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverInfo, setHoverInfo] = useState<string>('');
  const [flatDims, setFlatDims] = useState<{ width: number; height: number; totalPoints: number } | null>(null);
  const [flatBuf, setFlatBuf] = useState<Uint8Array | null>(null);
  const [headlineAvg, setHeadlineAvg] = useState<number | null>(null);
  const [perModel, setPerModel] = useState<Array<{ modelId: string; width: number; height: number; totalPoints: number; average: number }>>([]);

  // Load flat manifest + data
  useEffect(() => {
    (async () => {
      const mf = await fetch('/api/macro/flat/manifest');
      if (mf.ok) {
        const m = await mf.json();
        setFlatDims({ width: m.width, height: m.height, totalPoints: m.totalPoints });
        if (typeof m.headlineAverage === 'number') {
          setHeadlineAvg(m.headlineAverage);
        }
        const dres = await fetch('/api/macro/flat/data');
        if (dres.ok) {
          const ab = await dres.arrayBuffer();
          setFlatBuf(new Uint8Array(ab));
        }
        // Load per-model manifest (optional)
        try {
          const pmRes = await fetch('/api/macro/flat/models/manifest');
          if (pmRes.ok) {
            const pm = await pmRes.json();
            if (pm && Array.isArray(pm.models)) setPerModel(pm.models);
          }
        } catch {}
      }
    })();
  }, []);

  // Draw flat canvas
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    if (flatDims && flatBuf) {
      const { width, height } = flatDims;
      canvas.width = Math.min(width, 2048);
      canvas.height = Math.min(height, 1024);
      const scaleX = canvas.width / width;
      const scaleY = canvas.height / height;
      const scale = Math.min(scaleX, scaleY);
      const imgW = Math.floor(width * scale);
      const imgH = Math.floor(height * scale);
      const id = ctx.createImageData(width, height);
      const gradeColor = (t: number): [number, number, number] => {
        const h = 120 * t; // 0->red, 60->yellow, 120->green
        const s = 85; const l = 50;
        const c = (1 - Math.abs(2 * l / 100 - 1)) * s / 100;
        const hp = h / 60;
        const x = c * (1 - Math.abs((hp % 2) - 1));
        let r1=0,g1=0,b1=0;
        if (hp >= 0 && hp < 1) { r1=c; g1=x; b1=0; }
        else if (hp < 2) { r1=x; g1=c; b1=0; }
        else if (hp < 3) { r1=0; g1=c; b1=x; }
        else if (hp < 4) { r1=0; g1=x; b1=c; }
        else if (hp < 5) { r1=x; g1=0; b1=c; }
        else { r1=c; g1=0; b1=x; }
        const m = l/100 - c/2;
        return [Math.round((r1+m)*255), Math.round((g1+m)*255), Math.round((b1+m)*255)];
      };
      for (let i = 0; i < width * height; i++) {
        const v = flatBuf[i] ?? 0;
        const t = v / 255;
        const [r,g,b] = gradeColor(t);
        const j = i * 4; id.data[j] = r; id.data[j + 1] = g; id.data[j + 2] = b; id.data[j + 3] = 255;
      }
      const off = document.createElement('canvas');
      off.width = width; off.height = height;
      off.getContext('2d')!.putImageData(id, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(off, 0, 0, imgW, imgH);
    }
  }, [flatDims, flatBuf]);

  // Hover mapping to global index (flat dims)
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !flatDims) return;
    const onMove = async (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left; const sy = e.clientY - rect.top;
      const scaleX = canvas.width / flatDims.width;
      const scaleY = canvas.height / flatDims.height;
      const scale = Math.min(scaleX, scaleY);
      const imgW = flatDims.width * scale;
      const imgH = flatDims.height * scale;
      if (sx < 0 || sy < 0 || sx > imgW || sy > imgH) { setHoverInfo(''); return; }
      const bx = Math.min(flatDims.width - 1, Math.max(0, Math.floor(sx / scale)));
      const by = Math.min(flatDims.height - 1, Math.max(0, Math.floor(sy / scale)));
      const globalIndex = by * flatDims.width + bx;
      // TODO: enrich hover mapping via hierarchical indices if needed
      setHoverInfo(`#${globalIndex + 1}`);
    };
    canvas.addEventListener('mousemove', onMove);
    return () => canvas.removeEventListener('mousemove', onMove);
  }, [flatDims]);

  return (
    <div>
      <div className="mb-4 space-y-1">
        <h2 className="text-lg font-semibold">State of frontier AI</h2>
        {headlineAvg !== null && (
          <div className="text-sm">
            <span className="font-medium">{(headlineAvg * 100).toFixed(2)}%</span>
            <span className="ml-2 text-muted-foreground">
              {(() => {
                const pct = (headlineAvg || 0) * 100;
                if (pct >= 90) return 'Most needs met';
                if (pct >= 80) return 'Broadly strong, notable gaps';
                if (pct >= 70) return 'Mixed performance, significant gaps';
                if (pct >= 60) return 'Uneven and context-sensitive';
                if (pct >= 50) return 'Limited reliability, needs oversight';
                return 'Falls short on many needs';
              })()}
            </span>
          </div>
        )}
        <div className="text-xs text-muted-foreground">
          Aggregate coverage across all current evaluations (latest runs). High-level signal only.
        </div>
      </div>

      <div className="relative w-full h-[70vh] border rounded">
        <canvas ref={canvasRef} width={1920} height={800} className="w-full h-full" />
        {hoverInfo && (
          <div className="absolute bottom-2 left-2 text-xs px-2 py-1 rounded bg-black/60 text-white">{hoverInfo}</div>
        )}
      </div>
      {perModel && perModel.length > 0 && (
        <div className="mt-6">
          <h3 className="text-md font-semibold mb-2">Per-model snapshots</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {perModel.map((m) => (
              <PerModelCard key={m.modelId} model={m} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PerModelCard({ model }: { model: { modelId: string; width: number; height: number; totalPoints: number; average: number } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Simple client-side request limiter to avoid blasting too many fetches at once
  const limit = useRef<{q: Array<() => void>; inflight: number; max: number} | null>(null);
  if (!limit.current) limit.current = { q: [], inflight: 0, max: 8 };
  const withLimit = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve) => {
      const run = async () => {
        limit.current!.inflight++;
        try {
          const res = await fn();
          resolve(res);
        } finally {
          limit.current!.inflight--;
          const next = limit.current!.q.shift();
          if (next) next();
        }
      };
      if (limit.current!.inflight < limit.current!.max) run(); else limit.current!.q.push(run);
    });
  }, []);
  useEffect(() => {
    (async () => {
      const res = await withLimit(() => fetch(`/api/macro/flat/models/${encodeURIComponent(model.modelId)}/data`));
      if (!res.ok) return;
      const ab = await res.arrayBuffer();
      const buf = new Uint8Array(ab);
      const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
      // Build a wrapped grid for dense coverage: choose a wrap width for readability
      const total = model.totalPoints || buf.length;
      const wrapW = Math.min(256, Math.max(64, Math.floor(Math.sqrt(total))));
      const wrapH = Math.max(1, Math.ceil(total / wrapW));
      const id = ctx.createImageData(wrapW, wrapH);
      const gradeColor = (t: number): [number, number, number] => {
        const h = 120 * t; const s = 85; const l = 50;
        const c = (1 - Math.abs(2 * l / 100 - 1)) * s / 100; const hp = h / 60; const x = c * (1 - Math.abs((hp % 2) - 1));
        let r1=0,g1=0,b1=0; if (hp>=0&&hp<1){r1=c;g1=x;b1=0;} else if(hp<2){r1=x;g1=c;b1=0;} else if(hp<3){r1=0;g1=c;b1=x;} else if(hp<4){r1=0;g1=x;b1=c;} else if(hp<5){r1=x;g1=0;b1=c;} else {r1=c;g1=0;b1=x;}
        const m = l/100 - c/2; return [Math.round((r1+m)*255), Math.round((g1+m)*255), Math.round((b1+m)*255)];
      };
      for (let i = 0; i < total && i < buf.length; i++) {
        const v = buf[i] ?? 0; const t = v / 255; const [r,g,b] = gradeColor(t);
        const x = i % wrapW; const y = Math.floor(i / wrapW);
        const j = (y * wrapW + x) * 4;
        id.data[j]=r; id.data[j+1]=g; id.data[j+2]=b; id.data[j+3]=255;
      }
      const off = document.createElement('canvas'); off.width = wrapW; off.height = wrapH; off.getContext('2d')!.putImageData(id, 0, 0);
      // Resize fit to card
      canvas.width = 320; canvas.height = 120; ctx.imageSmoothingEnabled = false;
      const scale = Math.min(canvas.width / wrapW, canvas.height / wrapH);
      const w = Math.max(1, Math.floor(wrapW * scale)); const h = Math.max(1, Math.floor(wrapH * scale));
      ctx.clearRect(0,0,canvas.width,canvas.height); ctx.drawImage(off, 0, 0, w, h);
    })();
  }, [model]);
  return (
    <div className="border rounded p-3">
      <div className="text-sm font-medium mb-1 break-all">{model.modelId}</div>
      <div className="text-xs text-muted-foreground mb-2">Avg: {(model.average * 100).toFixed(2)}%</div>
      <canvas ref={canvasRef} className="w-full h-16 border rounded" />
    </div>
  );
}


