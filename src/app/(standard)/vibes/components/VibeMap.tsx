'use client';
import React from 'react';
import * as d3 from 'd3';

type VibesIndex = {
  models: Record<string, { averageHybrid: number | null; totalRuns: number; uniqueConfigs: number }>;
  similarity: Record<string, Record<string, { score: number; count: number }>>;
  capabilityScores?: Record<string, Record<string, { score: number | null; contributingRuns: number }>>;
  generatedAt: string;
};

type NodeDatum = {
  id: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  coverage: number | null;
  runs: number;
};

type LinkDatum = {
  source: string | NodeDatum;
  target: string | NodeDatum;
  similarity: number;
};

function coverageColor(v: number | null): string {
  if (v === null || isNaN(v)) return '#999';
  // 0..1 mapped to red->yellow->green
  const clamped = Math.max(0, Math.min(1, v));
  const hue = 120 * clamped; // 0=red(0), 1=green(120)
  return `hsl(${hue}, 70%, 50%)`;
}

function nodeRadius(v: number | null): number {
  if (v === null || isNaN(v)) return 6;
  // 0..1 => 6..14
  return 6 + 8 * Math.max(0, Math.min(1, v));
}

export default function VibeMap({
  data,
  selected,
  onSelect,
  alpha = 0.5,
  capability,
  capabilityMinRuns = 0,
  capabilityWeight = 0,
  onDebug,
  width = 900,
  height = 520,
  topK = 4,
  minSimilarity = 0.7,
}: {
  data: VibesIndex;
  selected?: string;
  onSelect?: (id: string) => void;
  alpha?: number;
  capability?: string;
  capabilityMinRuns?: number;
  capabilityWeight?: number;
  onDebug?: (msg: string) => void;
  width?: number;
  height?: number;
  topK?: number;
  minSimilarity?: number;
}) {
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [debugInfo, setDebugInfo] = React.useState<string>("");

  React.useEffect(() => {
    if (!data || !svgRef.current) return;

    const wSim = Math.max(0, Math.min(1, alpha));
    const wCap = Math.max(0, Math.min(1, capabilityWeight));
    const wCov = Math.max(0, 1 - wSim - wCap);
    const header = `wSim=${wSim.toFixed(2)} wCov=${wCov.toFixed(2)} wCap=${wCap.toFixed(2)} cap=${capability || '-'} minRuns=${capabilityMinRuns}`;
    setDebugInfo(header);
    try {
      // eslint-disable-next-line no-console
      console.log('[VibeMap] recompute weights', { wSim, wCov, wCap, capability, capabilityMinRuns });
    } catch {}

    const nodes: NodeDatum[] = Object.keys(data.models).map(id => ({
      id,
      coverage: data.models[id]?.averageHybrid ?? null,
      runs: data.models[id]?.totalRuns ?? 0,
    }));

    const links: LinkDatum[] = [];
    const seen = new Set<string>();
    nodes.forEach(n => {
      const neighbors = Object.entries(data.similarity[n.id] || {})
        .filter(([, v]) => typeof v.score === 'number')
        .sort((a, b) => (b[1].score - a[1].score))
        .slice(0, topK);
      neighbors.forEach(([mId, v]) => {
        if (v.score >= minSimilarity && n.id < mId) {
          const key = `${n.id}|${mId}`;
          if (!seen.has(key)) {
            seen.add(key);
            links.push({ source: n.id, target: mId, similarity: v.score });
          }
        }
      });
    });

    const getCap = (id: string): number | null => {
      if (!capability) return null;
      const rec = data.capabilityScores?.[id]?.[capability];
      if (!rec || (rec.contributingRuns ?? 0) < capabilityMinRuns) return null;
      return typeof rec.score === 'number' ? rec.score : null;
    };

    const distance = (l: any) => {
      const srcId = (typeof l.source === 'string' ? l.source : (l.source as any).id);
      const tgtId = (typeof l.target === 'string' ? l.target : (l.target as any).id);
      const sim = Math.max(0, Math.min(1, l.similarity));
      const srcCov = typeof (data.models[srcId]?.averageHybrid) === 'number' ? data.models[srcId].averageHybrid! : 0;
      const tgtCov = typeof (data.models[tgtId]?.averageHybrid) === 'number' ? data.models[tgtId].averageHybrid! : 0;
      const avgCov = ((srcCov || 0) + (tgtCov || 0)) / 2;
      const srcCap = getCap(srcId) ?? 0;
      const tgtCap = getCap(tgtId) ?? 0;
      const avgCap = (srcCap + tgtCap) / 2;
      const blended = wSim * sim + wCov * avgCov + wCap * avgCap;
      const dist = 200 * (1 - blended) + 30; // tighter for higher blended
      return dist;
    };

    const sim = d3.forceSimulation(nodes as any)
      .force('link', d3.forceLink(links as any).id((d: any) => d.id).distance(distance as any).strength(0.9))
      .force('charge', d3.forceManyBody().strength(-80))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .alphaDecay(0.05);

    try {
      const dvals = links.map(l => (distance as any)(l));
      const minD = Math.min(...dvals);
      const maxD = Math.max(...dvals);
      const meanD = dvals.reduce((a, b) => a + b, 0) / Math.max(1, dvals.length);
      const tail = `links=${links.length} minD=${minD.toFixed(1)} maxD=${maxD.toFixed(1)} meanD=${meanD.toFixed(1)}`;
      const combined = `${header} | ${tail}`;
      setDebugInfo(combined);
      onDebug && onDebug(combined);
      try {
        // eslint-disable-next-line no-console
        console.log('[VibeMap] link distances', { links: links.length, minD, maxD, meanD });
      } catch {}
    } catch {}

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g');

    const link = g
      .selectAll('line.link')
      .data(links)
      .enter()
      .append('line')
      .attr('class', 'link')
      .attr('stroke', '#bbb')
      .attr('stroke-opacity', 0.7)
      .attr('stroke-width', (d) => {
        const srcId = (typeof d.source === 'string' ? d.source : (d.source as any).id);
        const tgtId = (typeof d.target === 'string' ? d.target : (d.target as any).id);
        const srcCov = typeof (data.models[srcId]?.averageHybrid) === 'number' ? data.models[srcId].averageHybrid! : 0;
        const tgtCov = typeof (data.models[tgtId]?.averageHybrid) === 'number' ? data.models[tgtId].averageHybrid! : 0;
        const avgCov = ((srcCov || 0) + (tgtCov || 0)) / 2;
        const getCap = (id: string) => {
          if (!capability) return null;
          const rec = data.capabilityScores?.[id]?.[capability];
          if (!rec || (rec.contributingRuns ?? 0) < capabilityMinRuns) return null;
          return typeof rec.score === 'number' ? rec.score : null;
        };
        const srcCap = getCap(srcId) ?? 0;
        const tgtCap = getCap(tgtId) ?? 0;
        const avgCap = (srcCap + tgtCap) / 2;
        const wSim = Math.max(0, Math.min(1, alpha));
        const wCap = Math.max(0, Math.min(1, capabilityWeight));
        const wCov = Math.max(0, 1 - wSim - wCap);
        const blended = wSim * Math.max(0, Math.min(1, d.similarity)) + wCov * avgCov + wCap * avgCap;
        return 1 + 2.5 * blended;
      });

    const node = g
      .selectAll('g.node')
      .data(nodes)
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .on('click', (event, d: NodeDatum) => { onSelect && onSelect(d.id); })
      .call(d3.drag<SVGGElement, NodeDatum>()
        .on('start', (event, d) => {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x ?? null; d.fy = d.y ?? null;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    // No dot rendering; capsule-only representation

    // Capsule labels (rect + text) as part of node
    const label = node.append('g')
      .attr('class', 'label')
      .style('pointer-events', 'none')
      .style('display', 'block');

    const labelRect = label.append('rect')
      .attr('fill', 'rgba(255,255,255,0.92)')
      .attr('stroke', 'rgba(0,0,0,0.15)')
      .attr('stroke-width', 1);

    const labelText = label.append('text')
      .text(d => d.id)
      .attr('font-size', 10)
      .attr('fill', '#222');

    // Size and position capsule labels relative to circle radius
    function layoutLabels() {
      node.each(function (d: any) {
        const lg = d3.select(this).select<SVGGElement>('g.label');
        const txt = lg.select<SVGTextElement>('text');
        const rect = lg.select<SVGRectElement>('rect');
        // Measure text
        const bbox = (txt.node() as SVGTextElement).getBBox();
        const padX = 8, padY = 4;
        const w = bbox.width + padX * 2;
        const h = bbox.height + padY * 2;
        rect
          .attr('x', -w / 2)
          .attr('y', -h / 2)
          .attr('width', w)
          .attr('height', h)
          .attr('rx', h / 2)
          .attr('ry', h / 2);
        txt
          .attr('x', -w / 2 + padX)
          .attr('y', 3); // approx baseline adjustment for font-size 10
        // Center capsule on node
        lg.attr('transform', `translate(0, 0)`);
      });
    }
    layoutLabels();

    // Neighbor map for label priority
    const neighbors = new Map<string, Set<string>>();
    links.forEach(l => {
      const a = typeof l.source === 'string' ? l.source : (l.source as any).id;
      const b = typeof l.target === 'string' ? l.target : (l.target as any).id;
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a)!.add(b);
      neighbors.get(b)!.add(a);
    });

    let currentZoomK = 1;

    function overlaps(a: DOMRect, b: DOMRect): boolean {
      return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    }

    function updateLabelsVisibility(k: number) {
      // Always show all labels
      label.style('display', 'block');
      layoutLabels();
      // Scale capsules inversely with zoom to reduce overlap when zooming in
      const shrinkPower = 1.2;
      const scale = Math.pow(1 / Math.max(0.001, k), shrinkPower);
      g.selectAll<SVGGElement, any>('g.node').select('g.label')
        .attr('transform', `translate(0,0) scale(${scale})`);
      // Bring most important to front: selected and its neighbors
      const raiseById = (id: string) => {
        g.selectAll<SVGGElement, any>('g.node').filter((d: any) => d.id === id).raise();
      };
      if (selected) {
        raiseById(selected);
        (neighbors.get(selected) || new Set()).forEach(id => raiseById(id));
      }
    }

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.5, 3])
      .on('zoom', (event) => { g.attr('transform', event.transform); currentZoomK = event.transform.k; updateLabelsVisibility(currentZoomK); });
    svg.call(zoom as any);

    // Initial label state
    updateLabelsVisibility(1);

    function hueFromPosition(d: any): number {
      const cx = width / 2;
      const cy = height / 2;
      const dx = (d.x ?? cx) - cx;
      const dy = (d.y ?? cy) - cy;
      const angle = Math.atan2(dy, dx); // -PI..PI
      const hue = ((angle + Math.PI) / (2 * Math.PI)) * 360; // 0..360
      return hue;
    }

    sim.on('tick', () => {
      link
        .attr('x1', (d: any) => (d.source.x))
        .attr('y1', (d: any) => (d.source.y))
        .attr('x2', (d: any) => (d.target.x))
        .attr('y2', (d: any) => (d.target.y));

      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

    // Color: if capability selected, set stroke hue from capability value; otherwise from position
    g.selectAll<SVGGElement, any>('g.node').select('g.label').select('rect')
      .attr('stroke', (d: any) => {
        if (capability && data.capabilityScores?.[d.id]?.[capability]) {
          const rec = data.capabilityScores[d.id][capability];
          if ((rec.contributingRuns ?? 0) < capabilityMinRuns) return `hsl(${hueFromPosition(d)}, 70%, 45%)`;
          const v = rec.score;
          const clamped = Math.max(0, Math.min(1, typeof v === 'number' ? v : 0));
          const hue = 120 * clamped;
          return `hsl(${hue}, 70%, 45%)`;
        }
        return `hsl(${hueFromPosition(d)}, 70%, 45%)`;
      });
    });

    // Emphasis by target + alpha (stroke width boost by blended score to selected)
    if (selected) {
      const simsToSel = data.similarity[selected] || {};
      // Emphasize capsule border; set hue: capability color if selected, else local neighbor average coverage hue
      g.selectAll<SVGGElement, any>('g.node').select('g.label').select('rect')
      .attr('stroke-width', (d: any) => {
        const sim = typeof simsToSel[d.id]?.score === 'number' ? simsToSel[d.id].score : 0;
        const cov = typeof data.models[d.id]?.averageHybrid === 'number' ? data.models[d.id].averageHybrid! : 0;
          const capRec = capability ? data.capabilityScores?.[d.id]?.[capability] : null;
          const cap = (capRec && (capRec.contributingRuns ?? 0) >= capabilityMinRuns && typeof capRec.score === 'number') ? capRec.score : 0;
          const wSim = Math.max(0, Math.min(1, alpha));
          const wCap = Math.max(0, Math.min(1, capabilityWeight));
          const wCov = Math.max(0, 1 - wSim - wCap);
          const blended = wSim * sim + wCov * cov + wCap * cap;
        const base = d.id === selected ? 2.5 : 1.0;
        return base + 1.2 * blended;
      })
      .attr('stroke', (d: any) => {
          if (capability && data.capabilityScores?.[d.id]?.[capability]) {
            const rec = data.capabilityScores[d.id][capability];
            if ((rec.contributingRuns ?? 0) < capabilityMinRuns) {
              // fallback color as above
              const neigh = neighbors.get(d.id) || new Set<string>();
              const values: number[] = [];
              const selfCov = typeof data.models[d.id]?.averageHybrid === 'number' ? data.models[d.id].averageHybrid! : 0;
              values.push(selfCov);
              let count = 0;
              for (const nid of neigh) {
                const cov = typeof data.models[nid]?.averageHybrid === 'number' ? data.models[nid].averageHybrid! : null;
                if (cov !== null) { values.push(cov); count += 1; }
                if (count >= 6) break;
              }
              const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
              const hue = 120 * Math.max(0, Math.min(1, avg));
              return `hsl(${hue}, 70%, 45%)`;
            }
            const v = rec.score;
            const clamped = Math.max(0, Math.min(1, typeof v === 'number' ? v : 0));
            const hue = 120 * clamped;
            return `hsl(${hue}, 70%, 45%)`;
          }
          // Fallback: cluster coverage hue
          const neigh = neighbors.get(d.id) || new Set<string>();
          const values: number[] = [];
          const selfCov = typeof data.models[d.id]?.averageHybrid === 'number' ? data.models[d.id].averageHybrid! : 0;
          values.push(selfCov);
          let count = 0;
          for (const nid of neigh) {
            const cov = typeof data.models[nid]?.averageHybrid === 'number' ? data.models[nid].averageHybrid! : null;
            if (cov !== null) { values.push(cov); count += 1; }
            if (count >= 6) break;
          }
          const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          const hue = 120 * Math.max(0, Math.min(1, avg));
          return `hsl(${hue}, 70%, 45%)`;
      });
    }

    return () => { sim.stop(); };
  }, [data, width, height, topK, minSimilarity, selected, onSelect, alpha, capability, capabilityWeight, capabilityMinRuns]);

  return (
    <div className="relative">
      {/* <div className="absolute top-2 left-2 z-10 text-[10px] px-2 py-1 rounded bg-black/60 text-white pointer-events-none">
        {debugInfo}
      </div> */}
      <svg ref={svgRef} width={width} height={height} className="w-full h-[520px] bg-white dark:bg-neutral-950 rounded-md border" />
    </div>
  );
}


