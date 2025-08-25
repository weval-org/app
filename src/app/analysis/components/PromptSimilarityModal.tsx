'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { getModelDisplayLabel, parseModelIdForDisplay, resolveModelId } from '@/app/utils/modelIdUtils';
import SimilarityGraph from '@/app/analysis/components/SimilarityGraph';

const PromptSimilarityModal: React.FC = () => {
  const { promptSimilarityModal, closePromptSimilarityModal, fetchPerPromptSimilarities, fetchPromptResponses, displayedModels, resolvedTheme } = useAnalysis();
  const isOpen = !!promptSimilarityModal?.isOpen;
  const promptId = promptSimilarityModal?.promptId || null;

  const [matrix, setMatrix] = useState<Record<string, Record<string, number>> | null>(null);
  const [idealSimilarities, setIdealSimilarities] = useState<Record<string, number> | null>(null);
  const [showIdealList, setShowIdealList] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'pairs'|'map'|'axis'>('pairs');
  const [promptResponses, setPromptResponses] = useState<Record<string, string> | null>(null);
  const [selectedPair, setSelectedPair] = useState<{ a: string; b: string } | null>(null);
  const [spread, setSpread] = useState<number>(1);
  const axisContainerRef = useRef<HTMLDivElement | null>(null);
  const [axisWidth, setAxisWidth] = useState<number>(800);

  useEffect(() => {
    const update = () => {
      if (axisContainerRef.current) {
        const w = axisContainerRef.current.clientWidth;
        if (w && w > 0) setAxisWidth(w);
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isOpen || !promptId || !fetchPerPromptSimilarities) {
        setMatrix(null);
        return;
      }
      setLoading(true);
      const m = await fetchPerPromptSimilarities(promptId) as any;
      if (process.env.NODE_ENV !== 'production') {
        try {
          const matrix = m?.similarities || m;
          const ideal = m?.idealSimilarities;
          console.log('[PromptSimilarityModal] fetched per-prompt similarities', {
            promptId,
            hasMatrix: !!matrix,
            matrixKeys: matrix ? Object.keys(matrix) : [],
            hasIdeal: !!ideal,
            idealCount: ideal ? Object.keys(ideal).length : 0,
          });
        } catch {}
      }
      if (!cancelled) {
        const matrix = m?.similarities || m || null;
        const ideal = m?.idealSimilarities || null;
        setMatrix(matrix);
        setIdealSimilarities(ideal);
        setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [isOpen, promptId, fetchPerPromptSimilarities]);

  // Load prompt responses when pairs tab is active and a pair is selected
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isOpen || activeTab !== 'pairs' || !promptId || !fetchPromptResponses) return;
      if (!selectedPair) return;
      if (promptResponses) return; // already loaded
      const res = await fetchPromptResponses(promptId);
      if (!cancelled && res) setPromptResponses(res);
    };
    run();
    return () => { cancelled = true; };
  }, [isOpen, activeTab, promptId, fetchPromptResponses, selectedPair, promptResponses]);

  const modelList = useMemo(() => {
    if (!matrix) return [] as string[];
    // Use displayed models but only those present in matrix
    const set = new Set(Object.keys(matrix));
    return displayedModels.filter(m => set.has(m));
  }, [matrix, displayedModels]);

  const entries = useMemo(() => {
    if (!matrix) return [] as Array<{ a: string; b: string; s: number }>;
    const out: Array<{ a: string; b: string; s: number }> = [];
    const models = Object.keys(matrix);
    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const a = models[i];
        const b = models[j];
        const s = matrix[a]?.[b];
        if (typeof s === 'number' && !isNaN(s)) out.push({ a, b, s });
      }
    }
    // Sort most similar first (pairwise)
    out.sort((x, y) => y.s - x.s);
    return out;
  }, [matrix]);

  // Build 1D axis projection from pairwise distances using two farthest models
  const axisData = useMemo(() => {
    if (!matrix) return null as null | { coords: Array<{ id: string; x: number }>; extent: [number, number] };
    const keys = Object.keys(matrix);
    if (keys.length < 2) return null;
    // Distance function from similarity
    const dist = (a: string, b: string): number => {
      const s = matrix[a]?.[b] ?? matrix[b]?.[a] ?? NaN;
      const val = (typeof s === 'number' && !isNaN(s)) ? Math.max(0, 1 - s) : 1; // simple transform
      return Math.sqrt(val);
    };
    // Find farthest pair (max distance)
    let maxD = -1, A = keys[0], B = keys[1];
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const d = dist(keys[i], keys[j]);
        if (d > maxD) { maxD = d; A = keys[i]; B = keys[j]; }
      }
    }
    if (maxD <= 0) {
      const coords = keys.map((k, idx) => ({ id: k, x: idx }));
      return { coords, extent: [0, keys.length - 1] };
    }
    // Law of cosines projection: x(i) = (d(A,B)^2 + d(A,i)^2 - d(B,i)^2) / (2 d(A,B))
    const L = maxD;
    const L2 = L * L;
    const rawCoords: Array<{ id: string; x: number }> = keys.map((k) => {
      const dAi = dist(A, k);
      const dBi = dist(B, k);
      const x = (L2 + dAi * dAi - dBi * dBi) / (2 * L);
      return { id: k, x };
    });
    // Optionally include IDEAL if we have similarities to anchors A and B
    try {
      const sAIdeal = idealSimilarities?.[A];
      const sBIdeal = idealSimilarities?.[B];
      if (typeof sAIdeal === 'number' && !isNaN(sAIdeal) && typeof sBIdeal === 'number' && !isNaN(sBIdeal)) {
        const dAI = Math.sqrt(Math.max(0, 1 - sAIdeal));
        const dBI = Math.sqrt(Math.max(0, 1 - sBIdeal));
        const xIdeal = (L2 + dAI * dAI - dBI * dBI) / (2 * L);
        rawCoords.push({ id: 'IDEAL_BENCHMARK', x: xIdeal });
      }
    } catch {}
    // Normalize to [0,1]
    let minX = Infinity, maxX = -Infinity;
    rawCoords.forEach(c => { if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x; });
    const span = maxX - minX || 1;
    const norm = rawCoords.map(c => ({ id: c.id, x: (c.x - minX) / span }));
    return { coords: norm, extent: [0, 1] as [number, number] };
  }, [matrix, idealSimilarities]);

  // Reset state when opening a different prompt or when modal (re)opens
  useEffect(() => {
    if (!isOpen) {
      setSelectedPair(null);
      setPromptResponses(null);
      setMatrix(null);
      return;
    }
    // When switching to a new prompt while open
    setSelectedPair(null);
    setPromptResponses(null);
    setMatrix(null);
    setActiveTab('pairs');
  }, [isOpen, promptId]);

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={closePromptSimilarityModal}>
      <DialogContent className={"w-[100vw] h-[100vh] max-w-none p-0 m-0 rounded-none border-0 bg-background flex flex-col"}>
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-lg">Per-prompt Similarities</DialogTitle>
        </DialogHeader>
        {!promptId ? (
          <div className="p-4 text-sm text-muted-foreground">No prompt selected.</div>
        ) : loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading similarities…</div>
        ) : !matrix ? (
          <div className="p-4 text-sm text-muted-foreground">No similarities available for this prompt.</div>
        ) : (
          <Tabs value={activeTab} onValueChange={(v)=>setActiveTab(v as any)} className="flex-1 min-h-0 flex flex-col">
            <div className="px-4 pt-3">
              <TabsList>
                <TabsTrigger value="pairs">Pairs</TabsTrigger>
                <TabsTrigger value="map">2D Map</TabsTrigger>
                <TabsTrigger value="axis">Axis</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="pairs" className="flex-1 min-h-0 p-0">
              <div className="flex h-full min-h-0">
                <div className="w-full md:w-1/2 lg:w-2/5 border-r overflow-y-auto custom-scrollbar p-4">
                  <div className="text-xs text-muted-foreground mb-2">Prompt ID: <span className="font-mono">{promptId}</span></div>
                  {(idealSimilarities && Object.keys(idealSimilarities).length > 0) ? (
                    <div className="mb-3">
                      <button
                        className="text-xs text-muted-foreground hover:text-primary underline underline-offset-2"
                        onClick={() => setShowIdealList(v => !v)}
                      >
                        {showIdealList ? 'hide' : 'show'} model vs ideal (top)
                      </button>
                      {showIdealList && (
                        <div className="mt-2 border rounded-md divide-y">
                          {Object.entries(idealSimilarities)
                            .sort((a,b)=> (b[1]??0) - (a[1]??0))
                            .slice(0, 12)
                            .map(([baseId, val]) => (
                              <div key={baseId} className="px-3 py-2 flex items-center justify-between">
                                <div className="text-sm" title={baseId}>{getModelDisplayLabel(baseId, { hideProvider: true, prettifyModelName: true })} <span className="text-xs text-muted-foreground">vs ideal</span></div>
                                <div className="text-primary font-semibold">{((val||0)*100).toFixed(1)}%</div>
                              </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mb-3 text-[11px] text-muted-foreground">IDEAL similarities unavailable for this prompt/run.</div>
                  )}
                  <div className="divide-y border rounded-md">
                    {entries.map(({ a, b, s }, idx) => (
                      <button key={`${a}|${b}`} className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-muted ${selectedPair && selectedPair.a===a && selectedPair.b===b ? 'bg-muted/60' : ''}`}
                        onClick={() => setSelectedPair({ a, b })}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span className="w-6 text-right text-muted-foreground">{idx + 1}.</span>
                          <span title={a} className="flex items-center gap-2">
                            {getModelDisplayLabel(a, { hideProvider: true, prettifyModelName: true })}
                            {idealSimilarities && idealSimilarities[a] !== undefined && (
                              <span className="text-[10px] text-muted-foreground">vs ideal {(idealSimilarities[a]*100).toFixed(0)}%</span>
                            )}
                          </span>
                          <span className="text-muted-foreground">vs</span>
                          <span title={b} className="flex items-center gap-2">
                            {getModelDisplayLabel(b, { hideProvider: true, prettifyModelName: true })}
                            {idealSimilarities && idealSimilarities[b] !== undefined && (
                              <span className="text-[10px] text-muted-foreground">vs ideal {(idealSimilarities[b]*100).toFixed(0)}%</span>
                            )}
                          </span>
                        </div>
                        <div className="text-primary font-semibold">{(s * 100).toFixed(1)}%</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="hidden md:flex flex-1 min-w-0 flex-col p-4">
                  {!selectedPair ? (
                    <div className="text-sm text-muted-foreground">Select a pair to view both responses.</div>
                  ) : !promptResponses ? (
                    <div className="text-sm text-muted-foreground">Loading responses…</div>
                  ) : (
                    (() => {
                      const { a, b } = selectedPair;
                      const keys = Object.keys(promptResponses);
                      let modelA = resolveModelId(a, keys);
                      if (!promptResponses[modelA]) {
                        const fallbackA = keys.find(k => parseModelIdForDisplay(k).baseId === a);
                        if (fallbackA) modelA = fallbackA;
                      }
                      let modelB = resolveModelId(b, keys);
                      if (!promptResponses[modelB]) {
                        const fallbackB = keys.find(k => parseModelIdForDisplay(k).baseId === b);
                        if (fallbackB) modelB = fallbackB;
                      }
                      const respA = promptResponses[modelA];
                      const respB = promptResponses[modelB];
                      return (
                        <div className="grid grid-cols-2 gap-4 h-full min-h-0">
                          <div className="flex flex-col min-h-0 border rounded-md p-3 bg-card/50">
                            <div className="text-sm font-semibold mb-1" title={modelA}>{getModelDisplayLabel(a, { hideProvider: true, prettifyModelName: true })}</div>
                            <div className="text-xs text-muted-foreground mb-2">{getModelDisplayLabel(modelA, { hideProvider: true })}</div>
                            <div className="text-sm whitespace-pre-wrap leading-relaxed overflow-y-auto custom-scrollbar">{respA as string}</div>
                          </div>
                          <div className="flex flex-col min-h-0 border rounded-md p-3 bg-card/50">
                            <div className="text-sm font-semibold mb-1" title={modelB}>{getModelDisplayLabel(b, { hideProvider: true, prettifyModelName: true })}</div>
                            <div className="text-xs text-muted-foreground mb-2">{getModelDisplayLabel(modelB, { hideProvider: true })}</div>
                            <div className="text-sm whitespace-pre-wrap leading-relaxed overflow-y-auto custom-scrollbar">{respB as string}</div>
                          </div>
                        </div>
                      );
                    })()
                  )}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="map" className="flex-1 min-h-0 p-0">
              <div className="w-full h-full">
                <SimilarityGraph
                  similarityMatrix={matrix as any}
                  models={Object.keys(matrix)}
                  resolvedTheme={resolvedTheme}
                />
              </div>
            </TabsContent>
            <TabsContent value="axis" className="flex-1 min-h-0 p-4">
              {!axisData ? (
                <div className="text-sm text-muted-foreground">Not enough data to build axis.</div>
              ) : (
                (() => {
                  // Transform x by spread to fan out clusters
                  const transformed = axisData.coords.map(({ id, x }) => ({ id, x: Math.pow(x, spread) }));
                  const items = [...transformed].sort((a, b) => a.x - b.x); // left to right
                  // Greedy multi-row placement to avoid label collisions on a horizontal axis
                  const minPxGap = 110; // desired minimum horizontal gap between items on the same row
                  const minDelta = axisWidth > 0 ? (minPxGap / axisWidth) : 0.1; // normalized gap in [0..1]
                  const rowsLastX: number[] = [];
                  const placements: Array<{ id: string; x: number; row: number }> = [];
                  for (const it of items) {
                    let row = 0;
                    while (row < rowsLastX.length && (it.x - rowsLastX[row]) < minDelta) {
                      row++;
                    }
                    if (row === rowsLastX.length) rowsLastX.push(it.x); else rowsLastX[row] = it.x;
                    placements.push({ id: it.id, x: it.x, row });
                  }
                  const rowHeight = 22;
                  const topPad = 28;
                  const bottomPad = 16;
                  const containerHeight = topPad + rowsLastX.length * rowHeight + bottomPad;
                  const axisY = topPad + Math.max(0, (rowsLastX.length - 1)) * (rowHeight / 2);
                  return (
                    <div className="w-full h-full flex flex-col gap-3">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <label className="flex items-center gap-2">Spread
                          <input
                            type="range"
                            min={0.5}
                            max={3}
                            step={0.1}
                            value={spread}
                            onChange={(e)=>setSpread(parseFloat(e.target.value))}
                            className="w-40 align-middle"
                          />
                          <span className="tabular-nums">{spread.toFixed(1)}x</span>
                        </label>
                        <span className="ml-auto">0 ← dissimilar | similar → 1</span>
                      </div>
                      <div ref={axisContainerRef} className="relative w-full border rounded" style={{ height: containerHeight }}>
                        {/* horizontal axis line */}
                        <div className="absolute left-0 right-0" style={{ top: axisY }}>
                          <div className="h-px w-full bg-border" />
                        </div>
                        {(() => {
                          const rightFlipThreshold = axisWidth > 0 ? Math.max(0.6, 1 - 140 / axisWidth) : 0.85;
                          return placements.map(({ id, x, row }) => {
                          const leftPct = `${x * 100}%`;
                          const top = topPad + row * rowHeight;
                          const isIdeal = id === 'IDEAL_BENCHMARK' || id === 'IDEAL_MODEL_ID' || id === 'ideal';
                          const labelLeft = x > rightFlipThreshold; // near right edge → place label to the left of the dot
                          return (
                            <div key={id} className="absolute" style={{ top, left: leftPct }}>
                              {/* Anchor wrapper at the dot center */}
                              <div className="relative" style={{ transform: 'translate(-50%, -50%)' }}>
                                {/* Dot centered at (0,0) */}
                                <div className={`rounded-full ${isIdeal ? 'h-2.5 w-2.5 bg-primary ring-2 ring-primary/50 z-10' : 'h-2 w-2 bg-foreground/80'}`} style={{ position: 'absolute', left: isIdeal ? -5 : -4, top: isIdeal ? -5 : -4 }} />
                                {/* Label positioned to the right or left of the dot center */}
                                <div
                                  className={`text-xs whitespace-nowrap ${isIdeal ? 'text-primary font-medium' : ''}`}
                                  title={id}
                                  style={labelLeft ? { position: 'absolute', right: 8, top: -8 } : { position: 'absolute', left: 8, top: -8 }}
                                >
                                  {getModelDisplayLabel(id, { hideProvider: true, prettifyModelName: true })}
                                  {isIdeal && (
                                    <span className="ml-2 px-1 py-[1px] text-[10px] rounded border border-primary/40 bg-primary/10 text-primary align-middle">IDEAL</span>
                                  )}
                                  {idealSimilarities && idealSimilarities[id] !== undefined && (
                                    <span className="ml-2 text-[10px] text-muted-foreground">⟂ {(idealSimilarities[id]*100).toFixed(0)}%</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                          });
                        })()}
                      </div>
                    </div>
                  );
                })()
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PromptSimilarityModal;


