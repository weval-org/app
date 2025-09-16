'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import SpecificEvaluationModal from '@/app/analysis/components/SpecificEvaluationModal';
import { getHybridScoreColorClass } from '@/app/analysis/utils/colorUtils';

type Role = 'system' | 'user' | 'assistant';

function normalizeForKey(text: string): string {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

type NodeData = {
  id: string; // unique key: `${idx}|${role}::${norm}`
  idx: number; // column index in the conversation
  role: Role;
  text: string;
  hardcoded: boolean; // true for system/assistant messages coming from prompt context
  modelIds: Set<string>; // generated assistants that produced this exact text
  promptIds: Set<string>; // prompts that link to this node (for modal open)
};

type Edge = { from: string; to: string };

function colorForBaseId(baseId: string): string {
  // Deterministic pastel based on baseId
  let hash = 0;
  for (let i = 0; i < baseId.length; i++) hash = (hash * 31 + baseId.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 85%)`;
}

const BOX_WIDTH = 260;
const BOX_H_PAD = 28; // horizontal gap between columns
const BOX_V_GAP = 16; // vertical gap between nodes in a column
const PADDING = 24;

function estimateHeight(text: string, extra: number = 0): number {
  const maxCharsPerLine = 52;
  const hardBreaks = (text.match(/\n/g) || []).length;
  const softLines = Math.max(1, Math.ceil((text || '').length / maxCharsPerLine));
  const lines = Math.max(softLines, hardBreaks + 1);
  const lineHeight = 16; // matches NodeBox line-height
  const topBottom = 22;
  return Math.min(360, topBottom + lines * lineHeight + 8 + extra);
}

function estimateNodeHeight(n: NodeData): number {
  // Base text height + UI chrome for generated assistant nodes
  let extra = 0;
  if (n.role === 'assistant' && !n.hardcoded) {
    // Header row (role + coverage + base label)
    extra += 28;
    try {
      const bases = new Set<string>();
      const sysSet = new Set<number>();
      const tempsSet = new Set<number>();
      n.modelIds.forEach((mid) => {
        const p = parseModelIdForDisplay(mid);
        bases.add(p.baseId);
        if (typeof p.systemPromptIndex === 'number') sysSet.add(p.systemPromptIndex);
        if (typeof p.temperature === 'number') tempsSet.add(p.temperature);
      });
      if (bases.size > 1) {
        // base tabs row
        extra += 24;
      }
      // Rough chip rows for sys/temp selectors
      const chipRows = Math.min(3, sysSet.size + Math.ceil(tempsSet.size / 6));
      extra += chipRows * 18;
    } catch {}
  }
  return estimateHeight(n.text, extra);
}

const SimpleThreadClient: React.FC = () => {
  const { data, fetchPromptResponses, openModelEvaluationDetailModal } = useAnalysis();
  const [nodesByKey, setNodesByKey] = useState<Map<string, NodeData>>(new Map());
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<string>>(new Set());
  // Coverage filter (percentage 0..100)
  const [minPct, setMinPct] = useState<number>(0);
  const [maxPct, setMaxPct] = useState<number>(100);
  // Collapse simple linear chains by default
  const [collapseSimpleChains, setCollapseSimpleChains] = useState<boolean>(true);

  const promptIds = useMemo(() => data?.promptIds || [], [data?.promptIds]);
  const availablePromptIds = useMemo(() => {
    // Prefer blueprint config order if present
    const cfgIds: string[] = Array.isArray((data as any)?.config?.prompts)
      ? ((data as any).config.prompts.map((p: any) => p?.id).filter(Boolean))
      : [];
    const merged = cfgIds.length > 0 ? cfgIds : promptIds;
    // Filter to ones we actually have contexts for
    return merged.filter((pid: string) => (data as any)?.promptContexts?.[pid] !== undefined);
  }, [data, promptIds]);

  // Initialize selection to first prompt by config order
  useEffect(() => {
    if (!data) return;
    if (selectedPromptIds.size === 0 && availablePromptIds.length > 0) {
      setSelectedPromptIds(new Set([availablePromptIds[0]]));
    }
  }, [data, availablePromptIds, selectedPromptIds.size]);

  const togglePrompt = (pid: string) => {
    setSelectedPromptIds(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      // Ensure at least one selected
      if (next.size === 0 && availablePromptIds.length > 0) {
        next.add(availablePromptIds[0]);
      }
      return next;
    });
  };

  function getPromptLabel(pid: string): string {
    const ctx = (data as any)?.promptContexts?.[pid];
    if (typeof ctx === 'string') return ctx;
    if (Array.isArray(ctx)) {
      const lastUser = [...ctx].reverse().find((m: any) => m?.role === 'user' && typeof m?.content === 'string');
      if (lastUser) {
        const t = lastUser.content as string;
        return t.length > 120 ? `${t.slice(0, 120)}…` : t;
      }
      return `Multi-turn (${ctx.length} msgs)`;
    }
    return pid;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!data) return;
      setLoading(true);
      try {
        const newNodes = new Map<string, NodeData>();
        const newEdges: Edge[] = [];

        const sourcePids = (selectedPromptIds.size > 0 ? Array.from(selectedPromptIds) : availablePromptIds);
        for (const pid of sourcePids) {
          const ctx = (data as any).promptContexts?.[pid];
          const pathKeys: string[] = [];
          let messageIdx = 0;

          if (Array.isArray(ctx)) {
            for (const m of ctx) {
              const role = (m.role || 'user') as Role;
              if (!['system', 'user', 'assistant'].includes(role)) continue;
              const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
              const key = `${messageIdx}|${role}::${normalizeForKey(content)}`;
              if (!newNodes.has(key)) {
                newNodes.set(key, {
                  id: key,
                  idx: messageIdx,
                  role,
                  text: content,
                  hardcoded: role !== 'user',
                  modelIds: new Set<string>(),
                  promptIds: new Set<string>([pid]),
                });
              } else {
                newNodes.get(key)!.promptIds.add(pid);
              }
              pathKeys.push(key);
              messageIdx++;
            }
          } else if (typeof ctx === 'string') {
            const content = String(ctx);
            const key = `${messageIdx}|user::${normalizeForKey(content)}`;
            if (!newNodes.has(key)) {
              newNodes.set(key, {
                id: key,
                idx: messageIdx,
                role: 'user',
                text: content,
                hardcoded: false,
                modelIds: new Set<string>(),
                promptIds: new Set<string>([pid]),
              });
            } else {
              newNodes.get(key)!.promptIds.add(pid);
            }
            pathKeys.push(key);
            messageIdx++;
          }

          // Link hardcoded path edges
          for (let i = 0; i < pathKeys.length - 1; i++) {
            newEdges.push({ from: pathKeys[i], to: pathKeys[i + 1] });
          }

          // Append generated assistant responses as final column
          const respMap = await fetchPromptResponses(pid);
          if (cancelled) return;
          if (respMap) {
            const prevKey = pathKeys[pathKeys.length - 1];
            for (const [modelId, text] of Object.entries(respMap)) {
              if (typeof text !== 'string') continue;
              const nKey = `${messageIdx}|assistant::${normalizeForKey(text)}`;
              if (!newNodes.has(nKey)) {
                newNodes.set(nKey, {
                  id: nKey,
                  idx: messageIdx,
                  role: 'assistant',
                  text: text,
                  hardcoded: false,
                  modelIds: new Set<string>([modelId]),
                  promptIds: new Set<string>([pid]),
                });
              } else {
                newNodes.get(nKey)!.modelIds.add(modelId);
                newNodes.get(nKey)!.promptIds.add(pid);
              }
              if (prevKey) newEdges.push({ from: prevKey, to: nKey });
            }
          }
        }

        if (!cancelled) {
          setNodesByKey(newNodes);
          setEdges(newEdges);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [data, availablePromptIds, selectedPromptIds, fetchPromptResponses]);

  if (!data) return null;

  // Compute per-node average coverage (0..100, null if no scores) for assistant nodes
  const nodeCoveragePctById = useMemo(() => {
    const map = new Map<string, number | null>();
    try {
      const coverage = (data as any)?.evaluationResults?.llmCoverageScores as Record<string, Record<string, any>> | undefined;
      if (!coverage) return map;
      for (const n of nodesByKey.values()) {
        if (n.role !== 'assistant' || n.hardcoded) {
          map.set(n.id, null);
          continue;
        }
        let sum = 0;
        let count = 0;
        for (const pid of n.promptIds) {
          const perModel = coverage[pid] || {};
          for (const mid of n.modelIds) {
            const r = perModel[mid as string];
            const v = r && typeof r.avgCoverageExtent === 'number' ? r.avgCoverageExtent : null;
            if (v !== null && !isNaN(v)) {
              sum += v;
              count += 1;
            }
          }
        }
        map.set(n.id, count > 0 ? Math.round((sum / count) * 100) : null);
      }
    } catch {}
    return map;
  }, [nodesByKey, data]);

  // Visible node IDs according to coverage filter (applies only to generated assistant nodes)
  const visibleNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const n of nodesByKey.values()) {
      if (n.role === 'assistant' && !n.hardcoded) {
        const val = nodeCoveragePctById.get(n.id);
        const pct: number | null = (val === undefined ? null : val);
        const show = pct !== null && pct >= minPct && pct <= maxPct;
        if (!show) continue;
      }
      set.add(n.id);
    }
    return set;
  }, [nodesByKey, nodeCoveragePctById, minPct, maxPct]);

  const hiddenAssistantCount = useMemo(() => {
    let total = 0; let visible = 0;
    for (const n of nodesByKey.values()) {
      if (n.role === 'assistant' && !n.hardcoded) {
        total += 1;
        if (visibleNodeIds.has(n.id)) visible += 1;
      }
    }
    return Math.max(0, total - visible);
  }, [nodesByKey, visibleNodeIds]);

  // Group nodes by column (visible-only)
  const columns = useMemo(() => {
    const map = new Map<number, NodeData[]>();
    for (const n of nodesByKey.values()) {
      if (!visibleNodeIds.has(n.id)) continue;
      if (!map.has(n.idx)) map.set(n.idx, []);
      map.get(n.idx)!.push(n);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.role.localeCompare(b.role) || a.text.localeCompare(b.text));
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [nodesByKey, visibleNodeIds]);

  // Build id->column index map and adjacency from filtered edges
  const nodeIdxById = useMemo(() => {
    const m = new Map<string, number>();
    columns.forEach(([idx, arr]) => { arr.forEach(n => m.set(n.id, idx)); });
    return m;
  }, [columns]);

  const outEdgesMap = useMemo(() => {
    const m = new Map<string, string[]>();
    edges.forEach(e => {
      if (!visibleNodeIds.has(e.from) || !visibleNodeIds.has(e.to)) return;
      const arr = m.get(e.from) || [];
      arr.push(e.to);
      m.set(e.from, arr);
    });
    return m;
  }, [edges, visibleNodeIds]);

  const inEdgesMap = useMemo(() => {
    const m = new Map<string, string[]>();
    edges.forEach(e => {
      if (!visibleNodeIds.has(e.from) || !visibleNodeIds.has(e.to)) return;
      const arr = m.get(e.to) || [];
      arr.push(e.from);
      m.set(e.to, arr);
    });
    return m;
  }, [edges, visibleNodeIds]);

  // Determine which columns to keep when collapsing: keep columns with >1 nodes or endpoints/branching
  // Precompute edges limited to visible nodes (used in both modes)
  const filteredEdges = useMemo(() => {
    return edges.filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to));
  }, [edges, visibleNodeIds]);

  const { displayColumns, bridgedEdges, collapsedTurnCount } = useMemo(() => {
    if (!collapseSimpleChains) {
      return { displayColumns: columns, bridgedEdges: filteredEdges, collapsedTurnCount: 0 } as const;
    }
    // Mark kept columns
    const kept: boolean[] = columns.map(() => false);
    const idxList = columns.map(([idx]) => idx);
    const idxToPos = new Map<number, number>();
    idxList.forEach((v, i) => idxToPos.set(v, i));
    let collapsedCount = 0;

    columns.forEach(([cIdx, arr], pos) => {
      if (arr.length > 1) { kept[pos] = true; return; }
      if (arr.length === 0) { kept[pos] = true; return; }
      // For single node, keep if branching or terminal (inDeg!=1 or outDeg!=1)
      const n = arr[0];
      const inDeg = (inEdgesMap.get(n.id) || []).length;
      const outDeg = (outEdgesMap.get(n.id) || []).length;
      kept[pos] = !(inDeg === 1 && outDeg === 1);
    });

    // Ensure first/last columns visible
    if (kept.length > 0) { kept[0] = true; kept[kept.length - 1] = true; }

    const displayColumns = columns.filter((_, i) => kept[i]);
    const keptIdxSet = new Set(displayColumns.map(([idx]) => idx));

    // Count collapsed turns = number of hidden singleton columns
    collapsedCount = columns.reduce((acc, [_, arr], i) => acc + (!kept[i] && arr.length === 1 ? 1 : 0), 0);

    // Bridge edges from each kept column to the next kept column to the right
    const keptPositions = displayColumns.map(([idx]) => idx);
    const keptPosSet = new Set(keptPositions);
    const bridged: Edge[] = [];
    const maxPos = keptPositions.length;
    for (let k = 0; k < maxPos - 1; k++) {
      const fromColIdx = keptPositions[k];
      const toColIdx = keptPositions[k + 1];
      const fromNodes = columns[idxToPos.get(fromColIdx)!][1];
      // BFS from each start node until reach any node in toColIdx
      for (const start of fromNodes) {
        const queue: string[] = [...(outEdgesMap.get(start.id) || [])];
        const visited = new Set<string>();
        visited.add(start.id);
        while (queue.length) {
          const cur = queue.shift()!;
          if (visited.has(cur)) continue;
          visited.add(cur);
          const cIdx = nodeIdxById.get(cur);
          if (cIdx === undefined) continue;
          if (cIdx === toColIdx) {
            bridged.push({ from: start.id, to: cur });
            // Do not expand further once we reach the next kept column for this path
            continue;
          }
          // Only traverse forward if between from and next kept
          if (cIdx > fromColIdx && cIdx < toColIdx) {
            const outs = outEdgesMap.get(cur) || [];
            for (const nxt of outs) queue.push(nxt);
          }
        }
      }
    }

    // Fallback: if no bridged edges found (e.g., small graphs), use filteredEdges
    const useEdges = bridged.length > 0 ? bridged : filteredEdges;
    return { displayColumns, bridgedEdges: useEdges, collapsedTurnCount: collapsedCount } as const;
  }, [collapseSimpleChains, columns, filteredEdges, inEdgesMap, outEdgesMap, nodeIdxById]);

  // Build visual columns by inserting a synthetic collapsed node column between kept columns that hide >0 turns.
  const { visualColumns, visualEdges } = useMemo(() => {
    if (!collapseSimpleChains) {
      return { visualColumns: displayColumns, visualEdges: filteredEdges } as const;
    }
    // Map kept column indices to their position in displayColumns
    const keptIdxList = displayColumns.map(([idx]) => idx);
    const idxToPos = new Map<number, number>();
    keptIdxList.forEach((v, i) => idxToPos.set(v, i));

    // Determine gaps and create synthetic nodes
    const syntheticColumns: Array<[number, NodeData[]]> = [];
    const gapInfos: Array<{ leftIdx: number; rightIdx: number; nodeId: string }> = [];
    for (let k = 0; k < displayColumns.length - 1; k++) {
      const leftIdx = displayColumns[k][0];
      const rightIdx = displayColumns[k + 1][0];
      const hidden = (nodeIdxById.size > 0 ? ((leftIdx < rightIdx ? rightIdx - leftIdx : 0) - 1) : 0);
      // More accurate hidden count using original columns array positions
      // Find positions in original columns array
      // columns is array of [idx, arr] sorted
      // Compute original positions
      const origPosLeft = columns.findIndex(([idx]) => idx === leftIdx);
      const origPosRight = columns.findIndex(([idx]) => idx === rightIdx);
      const hiddenTurns = origPosRight > origPosLeft ? (origPosRight - origPosLeft - 1) : 0;
      if (hiddenTurns > 0) {
        const nodeId = `collapsed-${k}`;
        const collapsedNode: NodeData = {
          id: nodeId,
          idx: (leftIdx + rightIdx) / 2,
          role: 'system',
          text: `${hiddenTurns} message${hiddenTurns === 1 ? '' : 's'} collapsed — click to expand`,
          hardcoded: true,
          modelIds: new Set<string>(),
          promptIds: new Set<string>(),
        };
        syntheticColumns.push([collapsedNode.idx, [collapsedNode]]);
        gapInfos.push({ leftIdx, rightIdx, nodeId });
      }
    }

    // Interleave original kept columns with synthetic gap columns, maintaining order by idx
    const combined: Array<[number, NodeData[]]> = [...displayColumns, ...syntheticColumns].sort((a, b) => a[0] - b[0]);

    // Rewrite edges to route through collapsed node when crossing a gap
    const leftIdsByIdx = new Map<number, Set<string>>();
    const rightIdsByIdx = new Map<number, Set<string>>();
    for (let i = 0; i < displayColumns.length - 1; i++) {
      const lIdx = displayColumns[i][0];
      const rIdx = displayColumns[i + 1][0];
      leftIdsByIdx.set(lIdx, new Set(displayColumns[i][1].map(n => n.id)));
      rightIdsByIdx.set(rIdx, new Set(displayColumns[i + 1][1].map(n => n.id)));
    }

    const gapByPair = new Map<string, string>();
    gapInfos.forEach(g => gapByPair.set(`${g.leftIdx}->${g.rightIdx}`, g.nodeId));

    const rewritten: Edge[] = [];
    bridgedEdges.forEach(e => {
      const fromCol = nodeIdxById.get(e.from);
      const toCol = nodeIdxById.get(e.to);
      if (fromCol === undefined || toCol === undefined) { rewritten.push(e); return; }
      const key = `${fromCol}->${toCol}`;
      const collapsedId = gapByPair.get(key);
      if (collapsedId) {
        rewritten.push({ from: e.from, to: collapsedId });
        rewritten.push({ from: collapsedId, to: e.to });
      } else {
        rewritten.push(e);
      }
    });

    return { visualColumns: combined, visualEdges: rewritten } as const;
  }, [collapseSimpleChains, displayColumns, filteredEdges, bridgedEdges, nodeIdxById, columns]);

  const positioned = useMemo(() => {
    const nodePos = new Map<string, { x: number; y: number; w: number; h: number }>();
    let maxWidth = PADDING;
    let maxHeight = 0;
    visualColumns.forEach(([, arr], colOrder) => {
      const x = PADDING + colOrder * (BOX_WIDTH + BOX_H_PAD);
      let y = PADDING;
      for (const n of arr) {
        const h = estimateNodeHeight(n);
        nodePos.set(n.id, { x, y, w: BOX_WIDTH, h });
        y += h + BOX_V_GAP;
        if (y > maxHeight) maxHeight = y;
      }
      const colRight = x + BOX_WIDTH;
      if (colRight > maxWidth) maxWidth = colRight;
    });
    return {
      nodePos,
      width: maxWidth + PADDING,
      height: Math.max(maxHeight + PADDING, 320),
    };
  }, [visualColumns]);

  // Use bridged edges when collapsing
  const effectiveEdges = useMemo(() => collapseSimpleChains ? visualEdges : filteredEdges, [collapseSimpleChains, visualEdges, filteredEdges]);

  // Collapsed spans metadata for clickable markers between kept columns
  const collapsedSpans = useMemo(() => {
    const spans: Array<{ order: number; hidden: number; midX: number }> = [];
    if (!collapseSimpleChains) return spans;
    const idxToPos = new Map<number, number>();
    columns.forEach(([idx], pos) => idxToPos.set(idx, pos));
    for (let k = 0; k < displayColumns.length - 1; k++) {
      const fromIdx = displayColumns[k][0];
      const toIdx = displayColumns[k + 1][0];
      const hidden = (idxToPos.get(toIdx)! - idxToPos.get(fromIdx)!) - 1;
      if (hidden > 0) {
        const xLeft = PADDING + k * (BOX_WIDTH + BOX_H_PAD);
        const xRight = PADDING + (k + 1) * (BOX_WIDTH + BOX_H_PAD);
        const midX = (xLeft + BOX_WIDTH + xRight) / 2;
        spans.push({ order: k, hidden, midX });
      }
    }
    return spans;
  }, [collapseSimpleChains, displayColumns, columns]);

  const legend = (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#bbdefb' }} /> user</span>
      <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm border border-dashed" style={{ background: '#f1f1f1', borderColor: '#999' }} /> hardcoded assistant/system</span>
      <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#eaeaea' }} /> shared generated assistant</span>
    </div>
  );

  return (
    <div className="mx-auto p-4 md:p-6 lg:p-8 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Conversation Graph (simple)</div>
        {legend}
      </div>

      {/* Coverage filter controls */}
      <div className="rounded border p-2 bg-card/50">
        <div className="text-xs font-semibold text-muted-foreground mb-1">Coverage filter</div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Range sliders */}
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={minPct}
              onChange={(e) => {
                const val = Math.max(0, Math.min(100, Number(e.target.value)));
                setMinPct(Math.min(val, maxPct));
              }}
            />
            <input
              type="range"
              min={0}
              max={100}
              value={maxPct}
              onChange={(e) => {
                const val = Math.max(0, Math.min(100, Number(e.target.value)));
                setMaxPct(Math.max(val, minPct));
              }}
            />
          </div>
          <label className="flex items-center gap-1 text-[11px]">
            <span>Min</span>
            <input
              type="number"
              className="h-6 w-16 border border-border rounded px-1 bg-background"
              value={minPct}
              min={0}
              max={100}
              onChange={(e) => {
                const val = Math.max(0, Math.min(100, Number(e.target.value)));
                setMinPct(Math.min(val, maxPct));
              }}
            />
            <span>%</span>
          </label>
          <label className="flex items-center gap-1 text-[11px]">
            <span>Max</span>
            <input
              type="number"
              className="h-6 w-16 border border-border rounded px-1 bg-background"
              value={maxPct}
              min={0}
              max={100}
              onChange={(e) => {
                const val = Math.max(0, Math.min(100, Number(e.target.value)));
                setMaxPct(Math.max(val, minPct));
              }}
            />
            <span>%</span>
          </label>
          <span className="text-[11px] text-muted-foreground">
            Hidden {hiddenAssistantCount} assistant response{hiddenAssistantCount === 1 ? '' : 's'}
          </span>
          <label className="flex items-center gap-1 text-[11px] ml-2">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={collapseSimpleChains}
              onChange={(e) => setCollapseSimpleChains(e.target.checked)}
            />
            Collapse simple chains
          </label>
          {collapseSimpleChains && (
            <span className="text-[11px] text-muted-foreground">Collapsed {collapsedTurnCount} turn{collapsedTurnCount === 1 ? '' : 's'}</span>
          )}
        </div>
      </div>

      {/* Prompt selector */}
      <div className="rounded border p-2 bg-card/50">
        <div className="text-xs font-semibold text-muted-foreground mb-1">Prompts</div>
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-auto">
          {availablePromptIds.map((pid) => (
            <label key={pid} className="flex items-center gap-1 text-[11px] border border-border rounded px-1.5 py-0.5 hover:bg-muted/50 cursor-pointer">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={selectedPromptIds.has(pid)}
                onChange={() => togglePrompt(pid)}
              />
              <span className="max-w-[26rem] truncate" title={`${pid}: ${getPromptLabel(pid)}`}>
                <span className="font-mono opacity-70 mr-1">{pid}</span>
                <span className="opacity-80">{getPromptLabel(pid)}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground">Building graph…</div>
      )}

      <div className="w-full overflow-auto border rounded bg-card">
        <svg width={positioned.width} height={positioned.height}>
          {/* Edges */}
          <g>
            {effectiveEdges.map((e, i) => {
              const a = positioned.nodePos.get(e.from);
              const b = positioned.nodePos.get(e.to);
              if (!a || !b) return null;
              const x1 = a.x + a.w;
              const y1 = a.y + a.h / 2;
              const x2 = b.x;
              const y2 = b.y + b.h / 2;
              const midX = (x1 + x2) / 2;
              const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
              return (
                <path key={i} d={path} stroke="#777" strokeWidth={1.2} fill="none" />
              );
            })}
          </g>

          {/* No separate markers; collapsed represented as real nodes */}

          {/* Nodes */}
          <g>
            {visualColumns.flatMap(([, arr]) => arr).map((n) => {
              const pos = positioned.nodePos.get(n.id);
              if (!pos) return null;
              let fill = '#bbdefb';
              let stroke = '#333';
              let strokeDasharray: string | undefined;
              if (n.role === 'assistant') {
                if (n.hardcoded) {
                  fill = '#f1f1f1';
                  strokeDasharray = '4 2';
                } else {
                  const models = Array.from(n.modelIds);
                  if (models.length <= 1) {
                    const base = models[0] ? parseModelIdForDisplay(models[0]).baseId : 'unknown';
                    fill = colorForBaseId(base);
                  } else {
                    fill = '#eaeaea';
                  }
                }
              } else if (n.role === 'system') {
                fill = '#f7fbff';
                strokeDasharray = '4 2';
              }

              const displayText = n.text.length > 320 ? `${n.text.slice(0, 320)}…` : n.text;
              const isGenerated = n.role === 'assistant' && !n.hardcoded;
              const anyModel = isGenerated ? Array.from(n.modelIds)[0] : null;
              const anyPrompt = Array.from(n.promptIds)[0] || '';

              const isCollapsedNode = n.id.startsWith('collapsed-');
              return (
                <g key={n.id} transform={`translate(${pos.x}, ${pos.y})`}>
                  <rect rx={6} ry={6} width={pos.w} height={pos.h} fill={isCollapsedNode ? '#f1f1f1' : fill} stroke={isCollapsedNode ? '#999' : stroke} strokeDasharray={isCollapsedNode ? '4 2' : strokeDasharray} />
                  <foreignObject x={8} y={6} width={pos.w - 16} height={pos.h - 12}>
                    <NodeBox
                      n={n}
                      displayText={displayText}
                      data={data}
                      openModelEvaluationDetailModal={openModelEvaluationDetailModal}
                      coveragePct={nodeCoveragePctById.get(n.id) ?? null}
                    />
                  </foreignObject>
                  {isCollapsedNode && (
                    <a onClick={() => setCollapseSimpleChains(false)}>
                      <rect width={pos.w} height={pos.h} fill="transparent" cursor="pointer" />
                    </a>
                  )}
                  {!isCollapsedNode && isGenerated && anyModel && (
                    <a onClick={() => openModelEvaluationDetailModal({ promptId: anyPrompt, modelId: anyModel })}>
                      <rect width={pos.w} height={pos.h} fill="transparent" cursor="pointer" />
                    </a>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <SpecificEvaluationModal />
    </div>
  );
};

export default SimpleThreadClient;

// Renders an assistant node box with model header and variant tabs
const NodeBox: React.FC<{
  n: NodeData;
  displayText: string;
  data: any;
  openModelEvaluationDetailModal: (args: { promptId: string; modelId: string }) => void;
  coveragePct: number | null;
}> = ({ n, displayText, data, openModelEvaluationDetailModal, coveragePct }) => {
  const isGenerated = n.role === 'assistant' && !n.hardcoded;
  const anyModel = isGenerated ? Array.from(n.modelIds)[0] : null;
  const anyPrompt = Array.from(n.promptIds)[0] || '';

  // Group variants by base -> sys -> temp
  const byBase = React.useMemo(() => {
    if (!isGenerated) return null as null | Record<string, { total: number; bySys: Record<number, Record<number, string[]>> }>;
    const out: Record<string, { total: number; bySys: Record<number, Record<number, string[]>> }> = {};
    const defaultTemp = (data as any)?.config?.temperature ?? 0;
    for (const mid of n.modelIds) {
      const p = parseModelIdForDisplay(mid);
      const base = p.baseId;
      const sys = (p.systemPromptIndex ?? 0) as number;
      const temp = (p.temperature ?? defaultTemp) as number;
      if (!out[base]) out[base] = { total: 0, bySys: {} };
      out[base].total++;
      if (!out[base].bySys[sys]) out[base].bySys[sys] = {};
      if (!out[base].bySys[sys][temp]) out[base].bySys[sys][temp] = [];
      out[base].bySys[sys][temp].push(mid);
    }
    return out;
  }, [isGenerated, n.modelIds, data]);

  // Active base tab (first by default)
  const [activeBase, setActiveBase] = useState<string | null>(null);
  useEffect(() => {
    if (!byBase) return;
    const bases = Object.keys(byBase).sort((a, b) => byBase[b].total - byBase[a].total);
    setActiveBase((prev) => (prev && byBase[prev] ? prev : bases[0] || null));
  }, [byBase]);

  const basesList = byBase ? Object.keys(byBase).sort((a, b) => byBase[b].total - byBase[a].total) : [];
  const headerBase = isGenerated ? (activeBase || basesList[0] || (anyModel ? parseModelIdForDisplay(anyModel).baseId : '')) : '';

  // Compute representative score for header chip (average across variants under active base)
  const headerScorePct = React.useMemo(() => {
    try {
      if (!byBase || !headerBase) return null;
      const mids = Object.values(byBase[headerBase].bySys).flatMap((temps) => Object.values(temps).flat());
      const scores: number[] = [];
      for (const modelId of mids) {
        for (const pid of n.promptIds) {
          const r = (data as any)?.evaluationResults?.llmCoverageScores?.[pid]?.[modelId];
          const v = r && typeof r.avgCoverageExtent === 'number' ? r.avgCoverageExtent : null;
          if (v !== null && !isNaN(v)) scores.push(v);
        }
      }
      if (scores.length === 0) return null;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return Math.round(avg * 100);
    } catch { return null; }
  }, [byBase, headerBase, n.promptIds, data]);

  return (
    <div style={{ fontSize: 12, lineHeight: '16px', wordWrap: 'break-word', whiteSpace: 'pre-wrap', color: 'var(--foreground)', textAlign: 'left' }} title={n.text}>
      {/* Header: role + model */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 600, opacity: 0.6 }}>{n.role}</div>
        {isGenerated && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {(headerScorePct !== null || coveragePct !== null) && (
              <span className={`${getHybridScoreColorClass(((headerScorePct ?? coveragePct) as number) / 100)} text-[11px] px-1.5 py-0.5 rounded-sm font-semibold`} title={`Coverage: ${headerScorePct ?? coveragePct}%`}>
                {headerScorePct ?? coveragePct}%
              </span>
            )}
            <span style={{ fontWeight: 600 }}>{headerBase}</span>
          </div>
        )}
      </div>

      {/* Variant tabs per base */}
      {isGenerated && byBase && basesList.length > 1 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.entries(byBase).sort((a, b) => b[1].total - a[1].total).map(([base, info]) => (
              <button
                key={base}
                style={{
                  fontSize: 11,
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '2px 6px',
                  background: activeBase === base ? 'var(--muted)' : 'transparent',
                }}
                onClick={() => setActiveBase(base)}
                title={`${base} (${info.total})`}
              >
                {base} ({info.total})
              </button>
            ))}
          </div>
        </div>
      )}

      {isGenerated && byBase && headerBase && byBase[headerBase] && (
        <div style={{ marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {Object.entries(byBase[headerBase].bySys)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .flatMap(([sys, temps]) =>
              Object.entries(temps)
                .sort((a, b) => Number(a[0]) - Number(b[0]))
                .map(([t, mids]) => (
                  <button
                    key={`${sys}-${t}`}
                    style={{ fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px', background: 'var(--card)' }}
                    title={`Open sys:${sys} T:${t}`}
                    onClick={() => openModelEvaluationDetailModal({ promptId: anyPrompt, modelId: mids[0] })}
                  >
                    sys:{sys}/T:{t} ({mids.length})
                  </button>
                ))
            )}
        </div>
      )}

      {/* Response text rendered as Markdown */}
      <div style={{ fontSize: 12 }}>
        <ResponseRenderer content={displayText} />
      </div>
    </div>
  );
};


