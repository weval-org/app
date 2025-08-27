'use client';

import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
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
  const lines = Math.max(1, Math.ceil((text || '').length / maxCharsPerLine));
  const lineHeight = 14;
  const topBottom = 18;
  return Math.min(300, topBottom + lines * lineHeight + 8 + extra);
}

const SimpleThreadClient: React.FC = () => {
  const { data, fetchPromptResponses, openModelEvaluationDetailModal } = useAnalysis();
  const [nodesByKey, setNodesByKey] = useState<Map<string, NodeData>>(new Map());
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<string>>(new Set());

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

  // Group nodes by column and compute layout
  const columns = useMemo(() => {
    const map = new Map<number, NodeData[]>();
    for (const n of nodesByKey.values()) {
      if (!map.has(n.idx)) map.set(n.idx, []);
      map.get(n.idx)!.push(n);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.role.localeCompare(b.role) || a.text.localeCompare(b.text));
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [nodesByKey]);

  const positioned = useMemo(() => {
    const nodePos = new Map<string, { x: number; y: number; w: number; h: number }>();
    let maxWidth = PADDING;
    let maxHeight = 0;
    columns.forEach(([, arr], colOrder) => {
      const x = PADDING + colOrder * (BOX_WIDTH + BOX_H_PAD);
      let y = PADDING;
      for (const n of arr) {
        const isGenerated = n.role === 'assistant' && !n.hardcoded;
        const extra = isGenerated ? 42 : 0; // space for model header/tabs
        const h = estimateHeight(n.text, extra);
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
  }, [columns]);

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
            {edges.map((e, i) => {
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

          {/* Nodes */}
          <g>
            {Array.from(nodesByKey.values()).map((n) => {
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

              return (
                <g key={n.id} transform={`translate(${pos.x}, ${pos.y})`}>
                  <rect rx={6} ry={6} width={pos.w} height={pos.h} fill={fill} stroke={stroke} strokeDasharray={strokeDasharray} />
                  <foreignObject x={8} y={6} width={pos.w - 16} height={pos.h - 12}>
                    <NodeBox
                      n={n}
                      displayText={displayText}
                      data={data}
                      openModelEvaluationDetailModal={openModelEvaluationDetailModal}
                    />
                  </foreignObject>
                  {isGenerated && anyModel && (
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
}> = ({ n, displayText, data, openModelEvaluationDetailModal }) => {
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
            {headerScorePct !== null && (
              <span className={`${getHybridScoreColorClass(headerScorePct / 100)} text-[11px] px-1.5 py-0.5 rounded-sm font-semibold`}>{headerScorePct}%</span>
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
        <ReactMarkdown>{displayText}</ReactMarkdown>
      </div>
    </div>
  );
};


