'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { Badge } from '@/components/ui/badge';
import Icon from '@/components/ui/icon';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import SpecificEvaluationModal from '@/app/analysis/components/SpecificEvaluationModal';
import { getHybridScoreColorClass } from '@/app/analysis/utils/colorUtils';

type Role = 'system' | 'user' | 'assistant';

function normalize(text: string): string {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(text: string): string {
  return normalize(text).toLowerCase();
}

type AssistantGroup = {
  text: string;
  models: string[]; // full model ids
  baseCounts: Record<string, number>;
  rejoinIndex?: number; // optional next stage index where this path rejoins main
  promptId: string;
};

type Stage = {
  index: number;
  userLabel: string;
  assistantGroups: AssistantGroup[];
  blueprintAssistants?: string[];
};

type Family = {
  id: string;
  label: string;
  stages: Stage[];
  promptsCount: number;
};

type TrieNode = {
  id: string;
  role: 'system' | 'user' | 'assistant';
  text: string;
  blueprintSources?: string[]; // promptIds contributing
  modelBases?: string[]; // unique base model ids that produced this exact text at this step
  modelIds?: string[]; // full model ids that responded this exact way
  children: TrieNode[];
};

function normalizeText(text: string): string {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function nodeKey(role: string, text: string): string {
  return `${role}::${normalizeText(text)}`;
}

function createNode(role: TrieNode['role'], text: string): TrieNode {
  return {
    id: `${role}:${Math.random().toString(36).slice(2, 10)}`,
    role,
    text,
    children: [],
  };
}

function insertPath(root: TrieNode, messages: Array<{ role: TrieNode['role']; content: string }>, sourcePromptId?: string) {
  let cursor = root;
  for (const m of messages) {
    const key = nodeKey(m.role, m.content);
    let child = cursor.children.find((c) => nodeKey(c.role, c.text) === key);
    if (!child) {
      child = createNode(m.role, m.content);
      cursor.children.push(child);
    }
    if (sourcePromptId) {
      child.blueprintSources = Array.from(new Set([...(child.blueprintSources || []), sourcePromptId]));
    }
    cursor = child;
  }
}

function attachAssistantForks(
  root: TrieNode,
  parentPath: Array<{ role: TrieNode['role']; content: string }>,
  assistantTexts: Array<{ text: string; baseModel: string; modelId: string }>,
  sourcePromptId: string
) {
  // Walk to parent node (end of parentPath)
  let cursor = root;
  for (const m of parentPath) {
    const key = nodeKey(m.role, m.content);
    const child = cursor.children.find((c) => nodeKey(c.role, c.text) === key);
    if (!child) return; // parent path not present
    cursor = child;
  }
  // For each assistant text, coalesce by normalized text
  for (const a of assistantTexts) {
    const key = nodeKey('assistant', a.text);
    let child = cursor.children.find((c) => nodeKey(c.role, c.text) === key);
    if (!child) {
      child = createNode('assistant', a.text);
      cursor.children.push(child);
    }
    child.blueprintSources = Array.from(new Set([...(child.blueprintSources || []), sourcePromptId]));
    child.modelBases = Array.from(new Set([...(child.modelBases || []), a.baseModel]));
    child.modelIds = Array.from(new Set([...(child.modelIds || []), a.modelId]));
  }
}

type VariantMode = 'base' | 'sys' | 'temp' | 'both';

const ThreadClient: React.FC = () => {
  const { data, fetchPromptResponses, openModelEvaluationDetailModal } = useAnalysis();
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(false);
  const [divergencesOnly, setDivergencesOnly] = useState(true);
  const [variantMode, setVariantMode] = useState<VariantMode>('base');
  const [stageCollapseSignal, setStageCollapseSignal] = useState<{ version: number; open: boolean }>({ version: 0, open: true });

  const promptIds = useMemo(() => data?.promptIds || [], [data?.promptIds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!data) return;
      setLoading(true);
      try {
        // Build per-prompt user turn lists
        const prompts = promptIds.map((pid) => {
          const ctx = data.promptContexts?.[pid];
          let userTurns: string[] = [];
          let assistantAfterUser: (string | null)[] = [];
          if (typeof ctx === 'string') {
            userTurns = [ctx];
            assistantAfterUser = [null];
          } else if (Array.isArray(ctx)) {
            for (let i = 0; i < ctx.length; i++) {
              const m = ctx[i];
              if (m.role === 'user') {
                userTurns.push(String(m.content ?? ''));
                const next = ctx[i + 1];
                if (next && next.role === 'assistant' && typeof next.content === 'string') {
                  assistantAfterUser.push(next.content as string);
                } else {
                  assistantAfterUser.push(null);
                }
              }
            }
          }
          return { promptId: pid, userTurns, assistantAfterUser } as any;
        });

        // Group prompts into families by first user turn (normalized).
        const familiesMap = new Map<string, { prompts: typeof prompts; label: string }>();
        for (const p of prompts) {
          const first = p.userTurns[0] ?? `Prompt:${p.promptId}`;
          const key = normalizeKey(first);
          const entry = familiesMap.get(key);
          if (!entry) {
            familiesMap.set(key, { prompts: [p] as any, label: first });
          } else {
            (entry.prompts as any).push(p);
          }
        }

        const builtFamilies: Family[] = [];
        for (const [key, fam] of familiesMap.entries()) {
          const famPrompts = fam.prompts as { promptId: string; userTurns: string[]; assistantAfterUser: (string | null)[] }[];
          const famMaxStages = famPrompts.reduce((m, p) => Math.max(m, p.userTurns.length), 0);
          const famStageLabels: string[] = [];
          const famStageBlueprints: string[][] = Array.from({ length: famMaxStages }, () => []);
          for (let i = 0; i < famMaxStages; i++) {
            const counts = new Map<string, number>();
            const original = new Map<string, string>();
            for (const p of famPrompts) {
              if (p.userTurns[i] !== undefined) {
                const k = normalizeKey(p.userTurns[i]);
                counts.set(k, (counts.get(k) || 0) + 1);
                if (!original.has(k)) original.set(k, p.userTurns[i]);
                const bp = p.assistantAfterUser[i];
                if (bp && typeof bp === 'string') famStageBlueprints[i].push(bp);
              }
            }
            if (counts.size === 0) famStageLabels.push(`Stage ${i + 1}`); else {
              const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
              famStageLabels.push(original.get(best) || `Stage ${i + 1}`);
            }
          }
          const famStageGroups: AssistantGroup[][] = Array.from({ length: famMaxStages }, () => []);
          for (const p of famPrompts) {
            if (p.userTurns.length === 0) continue;
            const stageIndex = p.userTurns.length - 1;
            const respMap = await fetchPromptResponses(p.promptId);
            if (cancelled) return;
            if (!respMap) continue;
            const groupMap = new Map<string, AssistantGroup>();
            for (const [modelId, text] of Object.entries(respMap)) {
              if (typeof text !== 'string') continue;
              const k = normalizeKey(text);
              const parsed = parseModelIdForDisplay(modelId);
              if (!groupMap.has(k)) groupMap.set(k, { text, models: [], baseCounts: {}, promptId: p.promptId });
              const g = groupMap.get(k)!;
              g.models.push(modelId);
              g.baseCounts[parsed.baseId] = (g.baseCounts[parsed.baseId] || 0) + 1;
            }
            const rejoin = famPrompts.some((q) => q.userTurns.length > stageIndex + 1) ? stageIndex + 1 : undefined;
            const arr = Array.from(groupMap.values()).map((g) => ({ ...g, rejoinIndex: rejoin }));
            famStageGroups[stageIndex] = famStageGroups[stageIndex].concat(arr);
          }
          const stages: Stage[] = famStageLabels.map((label, i) => ({ index: i, userLabel: label, assistantGroups: famStageGroups[i] || [], blueprintAssistants: Array.from(new Set(famStageBlueprints[i])) }));
          builtFamilies.push({ id: key, label: fam.label, stages, promptsCount: famPrompts.length });
        }

        if (!cancelled) setFamilies(builtFamilies);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [data, promptIds, fetchPromptResponses]);

  if (!data) return null;

  return (
    <div className="mx-auto p-4 md:p-6 lg:p-8 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Conversation Branching View</div>
        <div className="flex items-center gap-3 text-xs">
          <button
            className="px-2 py-[2px] border border-border rounded hover:bg-muted/50"
            onClick={() => setStageCollapseSignal(({ version }) => ({ version: version + 1, open: false }))}
            title="Collapse all stages"
          >
            Collapse all
          </button>
          <button
            className="px-2 py-[2px] border border-border rounded hover:bg-muted/50"
            onClick={() => setStageCollapseSignal(({ version }) => ({ version: version + 1, open: true }))}
            title="Expand all stages"
          >
            Expand all
          </button>
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input type="checkbox" className="h-3.5 w-3.5" checked={divergencesOnly} onChange={(e) => setDivergencesOnly(e.target.checked)} />
            Divergences only
          </label>
          <div className="flex items-center gap-1">
            <span>Variants:</span>
            <select className="text-xs border border-border rounded px-1 py-[2px] bg-background" value={variantMode} onChange={(e) => setVariantMode(e.target.value as VariantMode)}>
              <option value="base">Base</option>
              <option value="sys">By system</option>
              <option value="temp">By temp</option>
              <option value="both">Both</option>
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center text-muted-foreground">
          <Icon name="loader-2" className="h-4 w-4 animate-spin mr-2" />
          Building conversation timeline...
        </div>
      )}

      {!loading && families.length > 0 && (
        <div className="relative">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-6">
            {families.map((fam, idx) => (
              <div key={fam.id} className="pl-0">
                <div className="flex items-center justify-between pl-6">
                  <div className="text-sm font-semibold text-foreground">Thread {idx + 1} {fam.promptsCount > 1 ? `(coalesced ${fam.promptsCount} prompts)` : ''}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[70%]" title={fam.label}>{fam.label}</div>
                </div>
                <div className="mt-2">
                  <StageTimeline
                    stages={fam.stages}
                    divergencesOnly={divergencesOnly}
                    variantMode={variantMode}
                    data={data}
                    onOpenModal={(promptId, modelId) => openModelEvaluationDetailModal({ promptId, modelId })}
                    collapseSignal={stageCollapseSignal}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mount modal so clicks can open it */}
      <SpecificEvaluationModal />
    </div>
  );
};

function truncate(text: string, max = 240) {
  if (!text) return { short: '', long: '', truncated: false };
  if (text.length <= max) return { short: text, long: text, truncated: false };
  return { short: text.slice(0, max) + '…', long: text, truncated: true };
}

const Branch: React.FC<{ node: TrieNode; depth: number; index: number; count: number }> = ({ node, depth, index, count }) => {
  const isRoot = depth === 0 && node.role === 'system' && node.text === 'ROOT';
  const [expanded, setExpanded] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);
  const t = truncate(node.text);
  const connector = isRoot ? '' : (index === count - 1 ? '└─' : '├─');

  const maxModelsInline = 8;
  const fullModels = node.modelIds || [];
  const visibleModels = showAllModels ? fullModels : fullModels.slice(0, maxModelsInline);

  return (
    <div className="ml-2">
      {!isRoot && (
        <div className="mb-2">
          <div className="flex items-start gap-2">
            <span className="font-mono text-muted-foreground text-xs leading-6 mt-[2px]">{connector}</span>
            <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">{node.role.charAt(0)}</Badge>
            <div className="flex-1">
              <div className="text-sm whitespace-pre-wrap">
                {expanded ? t.long : t.short}
                {t.truncated && (
                  <button className="ml-2 text-xs text-primary underline underline-offset-2" onClick={() => setExpanded((v) => !v)}>
                    {expanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {node.blueprintSources && node.blueprintSources.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">BP: {node.blueprintSources.join(', ')}</span>
                )}
              </div>

              {node.role === 'assistant' && fullModels.length > 0 && (
                <div className="mt-1 ml-2">
                  {visibleModels.map((mid) => {
                    const parsed = parseModelIdForDisplay(mid);
                    const label = parsed.baseId;
                    return (
                      <div key={mid} className="text-xs text-foreground flex items-center gap-2">
                        <span className="font-mono text-muted-foreground">→</span>
                        <Badge variant="outline" className="text-[10px]">{label}</Badge>
                        <span className="opacity-60">responded this way</span>
                      </div>
                    );
                  })}
                  {fullModels.length > maxModelsInline && (
                    <button className="mt-1 text-xs text-primary underline underline-offset-2" onClick={() => setShowAllModels((v) => !v)}>
                      {showAllModels ? 'Show fewer models' : `Show all ${fullModels.length} models`}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="border-l pl-3 ml-2">
        {node.children.map((child, i) => (
          <Branch key={child.id} node={child} depth={depth + 1} index={i} count={node.children.length} />
        ))}
      </div>
    </div>
  );
};

const StageTimeline: React.FC<{ stages: Stage[]; divergencesOnly: boolean; variantMode: VariantMode; data: any; onOpenModal: (promptId: string, modelId: string) => void; collapseSignal: { version: number; open: boolean } }>
  = ({ stages, divergencesOnly, variantMode, data, onOpenModal, collapseSignal }) => {
  let hiddenShared = 0;
  return (
    <div className="space-y-4">
      {stages.map((s, idx) => {
        const isDivergence = (s.assistantGroups?.length || 0) > 1;
        if (divergencesOnly && !isDivergence) {
          hiddenShared++;
          const nextIsDiv = stages[idx + 1] ? (stages[idx + 1].assistantGroups?.length || 0) > 1 : true;
          if (!nextIsDiv) return null;
          const chip = (
            <div key={`shared-${idx}`} className="pl-6">
              <span className="text-[11px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full border border-border">{hiddenShared} shared turn{hiddenShared === 1 ? '' : 's'} hidden</span>
            </div>
          );
          hiddenShared = 0;
          return chip;
        }
        hiddenShared = 0;
        return <StageCard key={s.index} stage={s} variantMode={variantMode} data={data} onOpenModal={onOpenModal} collapseSignal={collapseSignal} />;
      })}
    </div>
  );
};

const StageCard: React.FC<{ stage: Stage; variantMode: VariantMode; data: any; onOpenModal: (promptId: string, modelId: string) => void; collapseSignal: { version: number; open: boolean } }>
  = ({ stage, variantMode, data, onOpenModal, collapseSignal }) => {
  const groups = stage.assistantGroups || [];
  const [stageOpen, setStageOpen] = useState(true);
  useEffect(() => {
    setStageOpen(collapseSignal.open);
  }, [collapseSignal.version]);
  return (
    <div id={`stage-${stage.index}`} className="pl-6">
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2 w-2 rounded-full bg-primary/70 border border-border" />
        <div className="flex-1">
          <div className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setStageOpen((v) => !v)} title={stageOpen ? 'Collapse stage' : 'Expand stage'}>
              {stageOpen ? '▾' : '▸'}
            </button>
            <span>S{stage.index + 1} user</span>
          </div>
          <div className="text-sm whitespace-pre-wrap">{stage.userLabel}</div>

          {stage.blueprintAssistants && stage.blueprintAssistants.length > 0 && (
            <div className="mt-1 pl-4 border-l border-dashed border-border/60">
              {stage.blueprintAssistants.map((bp, i) => (
                <div key={i} className="text-[11px] text-muted-foreground">
                  <span className="px-1 py-0.5 rounded bg-muted/40 border border-border/60 mr-2">BP assistant</span>
                  <span className="whitespace-pre-wrap">{bp}</span>
                </div>
              ))}
            </div>
          )}

          {stageOpen && groups.length > 0 && (
            <div className="mt-2">
              <div className="text-xs font-semibold text-muted-foreground mb-1">assistant groups</div>
              <div className="space-y-1.5">
                {groups.map((g, i) => (
                  <AssistantGroupRow key={i} group={g} variantMode={variantMode} data={data} onOpenModal={onOpenModal} />
                ))}
              </div>
            </div>
          )}
          {!stageOpen && (
            <div className="mt-2 text-[11px] text-muted-foreground">(stage collapsed)</div>
          )}
        </div>
      </div>
    </div>
  );
};

const AssistantGroupRow: React.FC<{ group: AssistantGroup; variantMode: VariantMode; data: any; onOpenModal: (promptId: string, modelId: string) => void }>
  = ({ group, variantMode, data, onOpenModal }) => {
  const [expanded, setExpanded] = useState(false);
  // removed dropdown approach; using inline variant chips
  const t = truncate(group.text);
  const total = group.models.length;
  const baseEntries = Object.entries(group.baseCounts).sort((a, b) => b[1] - a[1]);
  const baseSummary = baseEntries.slice(0, 3).map(([b, n]) => `${b} (${n})`).join(', ');
  const extraBases = baseEntries.length > 3 ? ` +${baseEntries.length - 3} more` : '';

  const coverageAvg = useMemo(() => {
    try {
      const scores = group.models.map((m) => {
        const r = data?.evaluationResults?.llmCoverageScores?.[group.promptId]?.[m];
        if (!r || typeof r !== 'object' || 'error' in r) return null;
        const v = (r as any).avgCoverageExtent;
        return typeof v === 'number' && !isNaN(v) ? v : null;
      }).filter((v: number | null) => v !== null) as number[];
      if (scores.length === 0) return null;
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    } catch { return null; }
  }, [group.models, group.promptId, data?.evaluationResults?.llmCoverageScores]);

  const variantMap = useMemo(() => {
    if (variantMode === 'base') return null;
    const byBase: Record<string, { total: number; bySystem?: Record<number, { total: number; byTemp?: Record<number, string[]> }>; byTemp?: Record<number, string[]> }>
      = {};
    for (const mid of group.models) {
      const p = parseModelIdForDisplay(mid);
      if (!byBase[p.baseId]) byBase[p.baseId] = { total: 0 };
      byBase[p.baseId].total++;
      const sys = p.systemPromptIndex ?? 0;
      const temp = (p.temperature ?? (data?.config?.temperature ?? 0)) as number;
      if (variantMode === 'sys' || variantMode === 'both') {
        if (!byBase[p.baseId].bySystem) byBase[p.baseId].bySystem = {} as any;
        if (!byBase[p.baseId].bySystem![sys]) byBase[p.baseId].bySystem![sys] = { total: 0, byTemp: {} };
        byBase[p.baseId].bySystem![sys].total++;
        if (variantMode === 'both') {
          if (!byBase[p.baseId].bySystem![sys].byTemp![temp]) byBase[p.baseId].bySystem![sys].byTemp![temp] = [];
          byBase[p.baseId].bySystem![sys].byTemp![temp].push(mid);
        }
      }
      if (variantMode === 'temp') {
        if (!byBase[p.baseId].byTemp) byBase[p.baseId].byTemp = {} as any;
        if (!byBase[p.baseId].byTemp![temp]) byBase[p.baseId].byTemp![temp] = [];
        byBase[p.baseId].byTemp![temp].push(mid);
      }
    }
    return byBase;
  }, [variantMode, group.models, data?.config]);
  const scoreClass = useMemo(() => coverageAvg === null ? 'bg-muted text-foreground' : getHybridScoreColorClass(coverageAvg), [coverageAvg]);
  const scorePct = coverageAvg !== null ? Math.round(coverageAvg * 100) : null;
  return (
    <div className="rounded-md border border-border/70 bg-card/50">
      <div className="p-2 flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="text-sm whitespace-pre-wrap">
            <span className="cursor-pointer underline-offset-2 hover:underline" title="Open detailed evaluation" onClick={() => onOpenModal(group.promptId, group.models[0])}>
              {expanded ? t.long : t.short}
            </span>
            {t.truncated && (
              <button className="ml-2 text-xs text-primary underline underline-offset-2" onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-2">
            <span>{baseSummary}{extraBases} • {total} model{total === 1 ? '' : 's'}</span>
            {scorePct !== null && (
              <span className={`px-1.5 py-0.5 rounded-sm text-[11px] font-semibold ${scoreClass}`}>{scorePct}%</span>
            )}
            {group.rejoinIndex !== undefined && (
              <span
                className="ml-2 text-[11px] text-primary underline underline-offset-2 cursor-pointer"
                onClick={() => {
                  const el = document.getElementById(`stage-${group.rejoinIndex}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                → rejoins at S{group.rejoinIndex + 1}
              </span>
            )}
          </div>
          {scorePct !== null && (
            <div className="mt-1 h-1.5 rounded bg-muted/50 overflow-hidden">
              <div className={`h-full ${scoreClass}`} style={{ width: `${scorePct}%` }} />
            </div>
          )}
        </div>
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setExpanded((v) => !v)} title={expanded ? 'Collapse text' : 'Expand text'}>
          {expanded ? '▾' : '▸'}
        </button>
      </div>
      {variantMap && (
        <div className="px-2 pb-2 text-[11px] text-muted-foreground">
          {Object.entries(variantMap).sort((a, b) => b[1].total - a[1].total).slice(0, 6).map(([base, info]) => (
            <div key={base} className="mt-1">
              <span className="font-medium">{base}</span> <span>({info.total})</span>
              {variantMode !== 'temp' && info.bySystem && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {Object.entries(info.bySystem).map(([sys, sInfo]) => (
                    <button
                      key={sys}
                      className="px-1.5 py-0.5 border border-border rounded hover:bg-muted/50"
                      title={`Open sys:${sys}`}
                      onClick={() => {
                        const pick = group.models.find((mid) => {
                          const p = parseModelIdForDisplay(mid);
                          return p.baseId === base && (p.systemPromptIndex ?? 0) === Number(sys);
                        });
                        if (pick) onOpenModal(group.promptId, pick);
                      }}
                    >
                      sys:{sys} ({sInfo.total})
                    </button>
                  ))}
                </div>
              )}
              {variantMode !== 'sys' && info.byTemp && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {Object.entries(info.byTemp).sort((a,b)=>Number(a[0])-Number(b[0])).map(([t, arr]) => (
                    <button
                      key={t}
                      className="px-1.5 py-0.5 border border-border rounded hover:bg-muted/50"
                      title={`Open T:${t}`}
                      onClick={() => onOpenModal(group.promptId, arr[0])}
                    >
                      T:{t} ({arr.length})
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ThreadClient;


