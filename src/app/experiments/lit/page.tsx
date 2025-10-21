"use client";

import { useMemo, useRef, useState } from 'react';

type Event = { type: string; message?: string; data?: any };

const DEFAULTS = {
  embeddingModel: 'openai:text-embedding-3-small',
  compilerModel: 'openrouter:openai/gpt-4o-mini',
  coverageModel: 'openrouter:openai/gpt-4o-mini',
  candidateModels: 'openrouter:openai/gpt-4o-mini,openrouter:mistralai/mistral-medium-3',
  anchorModels: 'openrouter:openai/gpt-4o-mini',
  candTemp: 0.9,
  anchorTemp: 0.6,
  topN: 3,
  rankMode: 'composite' as 'composite' | 'pareto',
  coverageWeight: 0.7,
  useGate: false,
  coverageThreshold: 0.7,
};

export default function LitPage() {
  const [text, setText] = useState<string>("");
  const [params, setParams] = useState({ ...DEFAULTS });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [result, setResult] = useState<any | null>(null);
  const [showAnchors, setShowAnchors] = useState<boolean>(false);
  const [showAnchorTexts, setShowAnchorTexts] = useState<boolean>(false);
  const [showCandidates, setShowCandidates] = useState<boolean>(true);
  const [connState, setConnState] = useState<'idle' | 'connecting' | 'open' | 'closed'>('idle');
  const sseRef = useRef<EventSource | null>(null);
  const [liveCandidates, setLiveCandidates] = useState<Record<string, { text?: string; metrics?: any }>>({});
  const [liveAnchors, setLiveAnchors] = useState<Record<string, { text?: string }>>({});

  const groupedProgress = useMemo(() => {
    const normalizePhase = (e: any): string => {
      if (e?.data?.phase) return e.data.phase; // e.g., 'candidates' | 'anchors'
      const t = String(e?.type || '');
      if (t.startsWith('instruction_')) return 'instruction';
      if (t.startsWith('assertions_')) return 'assertions';
      if (t.startsWith('generation_')) return 'generation';
      if (t.startsWith('coverage_')) return 'coverage';
      if (t.startsWith('embedding_')) return 'embedding';
      if (t === 'completed') return 'completed';
      return t || 'unknown';
    };

    const groups: Record<string, { total?: number; completed?: number; logs: any[] }> = {};
    for (const e of events) {
      const phase = normalizePhase(e);
      if (!groups[phase]) groups[phase] = { logs: [] };
      groups[phase].logs.push(e);
      if (typeof e?.data?.total === 'number') groups[phase].total = e.data.total;
      if (typeof e?.data?.completed === 'number') groups[phase].completed = e.data.completed;
    }
    return groups;
  }, [events]);

  async function runLit() {
    setLoading(true);
    setError(null);
    setEvents([]);
    setResult(null);
    setLiveCandidates({});
    setLiveAnchors({});

    try {
      const payload = {
        text,
        ...params,
        candidateModels: params.candidateModels.split(',').map(s => s.trim()).filter(Boolean),
        anchorModels: params.anchorModels.split(',').map(s => s.trim()).filter(Boolean),
      };

      // Open SSE with payload encoded in the query string (server supports GET?q=...)
      const url = `/api/lit/stream?q=${encodeURIComponent(JSON.stringify(payload))}`;
      const es = new EventSource(url);
      sseRef.current = es;
      setConnState('connecting');

      const close = () => { try { es.close(); } catch {} sseRef.current = null; setConnState('closed'); setLoading(false); };

      es.addEventListener('open', () => setConnState('open'));
      es.addEventListener('ready', () => setConnState('open'));
      es.addEventListener('progress', (ev: MessageEvent) => {
        try {
          const evt = JSON.parse(ev.data) as Event;
          setEvents(prev => [...prev, evt]);
          if (evt.type === 'candidate_text' && evt.data?.modelId) {
            const { modelId, text } = evt.data;
            setLiveCandidates(prev => ({ ...prev, [modelId]: { ...(prev[modelId] || {}), text } }));
          } else if (evt.type === 'candidate_metrics' && evt.data?.modelId) {
            const { modelId, ...metrics } = evt.data;
            setLiveCandidates(prev => ({ ...prev, [modelId]: { ...(prev[modelId] || {}), metrics } }));
          } else if (evt.type === 'anchor_text' && evt.data?.modelId) {
            const { modelId, text } = evt.data;
            setLiveAnchors(prev => ({ ...prev, [modelId]: { ...(prev[modelId] || {}), text } }));
          }
        } catch {}
      });
      es.addEventListener('complete', (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data);
          if (data?.artifacts) setResult(data.artifacts);
        } catch {}
        close();
      });
      es.addEventListener('error', (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data);
          setError(data?.message || 'Stream error');
        } catch {
          setError('Stream error');
        }
        close();
      });

    } catch (e: any) {
      setError(e?.message || 'Unknown error');
      setLoading(false);
      setConnState('closed');
    }
  }

  function cancelRun() {
    try { sseRef.current?.close(); } catch {}
    sseRef.current = null;
    setConnState('closed');
    setLoading(false);
  }

  function resetAll() {
    setText("");
    setParams({ ...DEFAULTS });
    setEvents([]);
    setResult(null);
    setLiveCandidates({});
    setLiveAnchors({});
    setError(null);
    try { sseRef.current?.close(); } catch {}
    sseRef.current = null;
    setConnState('idle');
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify({ params, events, artifacts: result }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lit_result.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const SummaryChips = () => (
    <div className="flex items-center flex-wrap gap-2 text-xs text-gray-700">
      <span className="px-2 py-1 border rounded bg-gray-50">rank: {params.rankMode}</span>
      <span className="px-2 py-1 border rounded bg-gray-50">gate: {params.useGate ? 'on' : 'off'}</span>
      <span className="px-2 py-1 border rounded bg-gray-50">covWeight: {params.coverageWeight}</span>
      {result && (
        <>
          <span className="px-2 py-1 border rounded bg-gray-50">winners: {result?.winners?.length ?? 0}</span>
          <span className="px-2 py-1 border rounded bg-gray-50">candidates: {result?.candidates?.length ?? 0}</span>
          <span className="px-2 py-1 border rounded bg-gray-50">points: {result?.coveragePoints?.length ?? 0}</span>
        </>
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">LIT (Experimental)</h1>
          <p className="text-sm text-gray-600 mt-1">Generate stylistically divergent re-drafts while preserving content fidelity. Tune parameters, watch progress, and inspect results.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded border ${connState==='open' ? 'bg-green-50 border-green-200 text-green-700' : connState==='connecting' ? 'bg-yellow-50 border-yellow-200 text-yellow-800' : connState==='closed' ? 'bg-gray-100 border-gray-200 text-gray-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>Conn: {connState}</span>
          <button className="px-3 py-1.5 border rounded text-sm" onClick={resetAll} disabled={loading}>Reset</button>
          <button className="px-3 py-1.5 border rounded text-sm" onClick={downloadJson} disabled={!result}>Download JSON</button>
        </div>
      </div>

      <SummaryChips />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="border rounded-lg shadow-sm p-4 space-y-3 bg-white">
            <label className="block text-sm font-medium">Source Text</label>
            <textarea
              className="w-full border rounded p-3 min-h-[220px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Paste your text here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex items-center gap-3 pt-2">
              <button
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded shadow disabled:opacity-50 disabled:hover:bg-indigo-600"
                onClick={runLit}
                disabled={loading || !text.trim()}
              >
                {loading ? 'Running…' : 'Run LIT'}
              </button>
              {loading && (
                <button className="px-3 py-2 border rounded text-sm" onClick={cancelRun}>Cancel</button>
              )}
              {error && <span className="text-red-600 text-sm">{error}</span>}
            </div>
          </div>

          <details className="border rounded-lg shadow-sm bg-white" open>
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">Advanced Parameters</summary>
            <div className="p-4 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium">Embedding Model</label>
                <input className="w-full border rounded p-2" value={params.embeddingModel}
                  onChange={(e) => setParams(p => ({ ...p, embeddingModel: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium">Compiler Model</label>
                <input className="w-full border rounded p-2" value={params.compilerModel}
                  onChange={(e) => setParams(p => ({ ...p, compilerModel: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium">Coverage Model</label>
                <input className="w-full border rounded p-2" value={params.coverageModel}
                  onChange={(e) => setParams(p => ({ ...p, coverageModel: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium">Candidate Models (CSV)</label>
                <input className="w-full border rounded p-2" value={params.candidateModels}
                  onChange={(e) => setParams(p => ({ ...p, candidateModels: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium">Anchor Models (CSV)</label>
                <input className="w-full border rounded p-2" value={params.anchorModels}
                  onChange={(e) => setParams(p => ({ ...p, anchorModels: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium">Top N</label>
                <input type="number" className="w-full border rounded p-2" value={params.topN}
                  onChange={(e) => setParams(p => ({ ...p, topN: Number(e.target.value) || 1 }))} />
              </div>
              <div>
                <label className="block text-sm font-medium">Candidate Temp</label>
                <input type="number" step="0.05" className="w-full border rounded p-2" value={params.candTemp}
                  onChange={(e) => setParams(p => ({ ...p, candTemp: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="block text-sm font-medium">Anchor Temp</label>
                <input type="number" step="0.05" className="w-full border rounded p-2" value={params.anchorTemp}
                  onChange={(e) => setParams(p => ({ ...p, anchorTemp: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="block text-sm font-medium">Rank Mode</label>
                <select className="w-full border rounded p-2" value={params.rankMode}
                  onChange={(e) => setParams(p => ({ ...p, rankMode: (e.target.value as 'composite' | 'pareto') }))}>
                  <option value="composite">composite</option>
                  <option value="pareto">pareto</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium">Coverage Weight</label>
                <input type="number" step="0.05" min="0" max="1" className="w-full border rounded p-2" value={params.coverageWeight}
                  onChange={(e) => setParams(p => ({ ...p, coverageWeight: Math.min(1, Math.max(0, Number(e.target.value))) }))} />
              </div>
              <div className="flex items-center">
                <label className="text-sm">Use Gate</label>
                <input type="checkbox" className="ml-2" checked={params.useGate}
                  onChange={(e) => setParams(p => ({ ...p, useGate: e.target.checked }))} />
              </div>
              <div>
                <label className="block text-sm font-medium">Coverage Threshold</label>
                <input type="number" step="0.05" min="0" max="1" className="w-full border rounded p-2" value={params.coverageThreshold}
                  onChange={(e) => setParams(p => ({ ...p, coverageThreshold: Math.min(1, Math.max(0, Number(e.target.value))) }))} />
              </div>
            </div>
          </details>

          {/* Live drafts during run */}
          {(loading || Object.keys(liveCandidates).length > 0 || Object.keys(liveAnchors).length > 0) && (
            <div className="border rounded-lg shadow-sm p-4 bg-white">
              <h2 className="font-medium">Live Drafts</h2>
              <div className="mt-3 grid gap-3">
                {Object.keys(liveAnchors).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">Anchors</h3>
                    <div className="grid gap-2">
                      {Object.entries(liveAnchors).map(([mid, a]) => (
                        <div key={`live-a-${mid}`} className="border rounded p-2">
                          <div className="text-xs text-gray-600 font-mono">{mid}</div>
                          {a.text && <pre className="whitespace-pre-wrap text-sm mt-1">{a.text}</pre>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {Object.keys(liveCandidates).length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 mb-1">Candidates</h3>
                    <div className="grid gap-2">
                      {Object.entries(liveCandidates).map(([mid, c]) => (
                        <div key={`live-c-${mid}`} className="border rounded p-2">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-gray-600 font-mono">{mid}</div>
                            {c.metrics && (
                              <div className="text-[11px] text-gray-500">cov: {typeof c.metrics.coverage === 'number' ? c.metrics.coverage.toFixed(3) : '—'} | normSim: {typeof c.metrics.normSimilarity === 'number' ? c.metrics.normSimilarity.toFixed(3) : '—'}</div>
                            )}
                          </div>
                          {c.text && <pre className="whitespace-pre-wrap text-sm mt-1">{c.text}</pre>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-6">
              <div className="border rounded-lg shadow-sm p-4 bg-white">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium">Instruction Set</h2>
                  <button className="text-xs underline" onClick={() => navigator.clipboard.writeText(result.instructionSet || '')}>Copy</button>
                </div>
                <pre className="whitespace-pre-wrap text-sm mt-2">{result.instructionSet}</pre>
              </div>

              <div className="border rounded-lg shadow-sm p-4 bg-white">
                <div className="flex items-center justify-between">
                  <h2 className="font-medium">Coverage Points ({result.coveragePoints?.length ?? 0})</h2>
                  <button className="text-xs underline" onClick={() => navigator.clipboard.writeText((result.coveragePoints || []).join('\n'))}>Copy</button>
                </div>
                <ol className="list-decimal pl-6 text-sm mt-2 space-y-1">
                  {(result.coveragePoints || []).map((p: string, i: number) => <li key={i}>{p}</li>)}
                </ol>
              </div>

              <div className="flex items-center gap-4">
                <label className="text-sm"><input type="checkbox" className="mr-2" checked={showAnchors} onChange={(e) => setShowAnchors(e.target.checked)} />Show Anchors</label>
                {showAnchors && (
                  <label className="text-sm"><input type="checkbox" className="mr-2" checked={showAnchorTexts} onChange={(e) => setShowAnchorTexts(e.target.checked)} />Show Anchor Text</label>
                )}
                <label className="text-sm"><input type="checkbox" className="mr-2" checked={showCandidates} onChange={(e) => setShowCandidates(e.target.checked)} />Show Candidates</label>
              </div>

              {showAnchors && (
                <div className="border rounded-lg shadow-sm p-4 bg-white">
                  <h3 className="font-medium">Anchors</h3>
                  <ul className="mt-2 space-y-2">
                    {result.anchors?.map((a: any) => (
                      <li key={a.modelId} className="text-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-mono">{a.modelId}</span>
                            <span className="ml-2 text-gray-600">length: {a.length}</span>
                          </div>
                          {showAnchorTexts && a.text && (
                            <button className="text-xs underline" onClick={() => navigator.clipboard.writeText(a.text)}>Copy</button>
                          )}
                        </div>
                        {showAnchorTexts && a.text && (
                          <pre className="whitespace-pre-wrap mt-2">{a.text}</pre>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {showCandidates && (
                <div className="border rounded-lg shadow-sm p-4 bg-white">
                  <h3 className="font-medium">Candidates (ranked)</h3>
                  <div className="grid gap-2">
                    {result.candidatesSorted?.map((c: any) => (
                      <div key={c.modelId} className="border rounded p-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm text-gray-600 font-mono">{c.modelId}</div>
                            <div className="text-xs text-gray-500">rankScore: {c.rankScore ?? '—'} | coverage: {c.coverage?.toFixed?.(3) ?? '—'} | normSim: {c.normSimilarity?.toFixed?.(3) ?? '—'} | overlap3: {c.overlap3?.toFixed?.(3) ?? '—'}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border rounded-lg shadow-sm p-4 bg-white">
                <h2 className="font-medium">Winners (Top {result?.winners?.length ?? 0})</h2>
                <div className="space-y-3 mt-2">
                  {result.winners?.map((w: any) => (
                    <div key={w.modelId} className="border rounded p-2">
                      <div className="text-sm text-gray-600 font-mono">{w.modelId}</div>
                      <div className="text-xs text-gray-500">coverage: {w.coverage?.toFixed?.(3) ?? '—'} | normSim: {w.normSimilarity?.toFixed?.(3) ?? '—'} | overlap3: {w.overlap3?.toFixed?.(3) ?? '—'}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <button className="text-xs underline" onClick={() => navigator.clipboard.writeText(w.text || '')}>Copy</button>
                      </div>
                      <pre className="whitespace-pre-wrap mt-2 text-sm">{w.text}</pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="border rounded-lg shadow-sm p-4 bg-white sticky top-4">
            <h2 className="font-medium mb-2">Progress</h2>
            {events.length === 0 && <p className="text-sm text-gray-500">No events yet. Run LIT to see progress.</p>}
            <div className="grid grid-cols-1 gap-3">
              {Object.entries(groupedProgress).map(([phase, info]) => {
                const completed = info.completed ?? 0;
                const total = info.total ?? 0;
                const hasFinished = info.logs.some(l => String(l.type).endsWith('finished') || String(l.type) === 'completed');
                const pct = total > 0 ? Math.round((completed / total) * 100) : (hasFinished || phase === 'completed' ? 100 : 0);
                return (
                  <div key={phase} className="border rounded p-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-mono">{phase}</span>
                      <span className="text-gray-600">{total > 0 ? `${completed}/${total}` : `${pct}%`}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded mt-2 overflow-hidden">
                      <div className="h-2 bg-indigo-600" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
