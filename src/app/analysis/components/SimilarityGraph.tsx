'use client'

import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { getModelDisplayLabel, parseEffectiveModelId, IDEAL_MODEL_ID_BASE } from '@/app/utils/modelIdUtils'
import { SimilarityScore } from '@/types/shared'

interface SimilarityGraphProps {
  similarityMatrix: SimilarityScore
  models: string[]
  resolvedTheme?: string
}

// D3 Force Simulation Parameters
const FORCE_LINK_DISTANCE_MULTIPLIER = 280; // Adjusts overall graph spread. Reduced slightly
const FORCE_LINK_STRENGTH_MULTIPLIER = 1.8; // Multiplies similarity value for link strength. Increased slightly
const FORCE_CHARGE_STRENGTH = -1800; // Adjusted back slightly
const FORCE_COLLISION_RADIUS = 48; // Reduced slightly
const SIMULATION_DRAG_ALPHA_TARGET = 0.3; // Alpha target during node drag (keeps simulation slightly active).
const SIMULATION_INITIAL_ALPHA = 1; // Initial "heat" of the simulation.
const SIMILARITY_EMPHASIS_FACTOR = 3; // Factor to emphasize similarity differences

// Link Styling
const LINK_BASE_OPACITY = 0.3; // Reset to a more visible base
const LINK_WIDTH_MULTIPLIER = 12; // Retained for now
const LINK_WIDTH_BASE = 0.75; // Retained base width
const LINK_LABEL_FONT_SIZE = '9px'; // Slightly smaller link labels
const LINK_LABEL_OFFSET_Y = -5; // Adjusted vertical offset for link labels.

// Node Styling
const NODE_RADIUS = 20; // Reduced node radius slightly
const NODE_STROKE_WIDTH = 1.5; // Thinner node stroke
const NODE_LABEL_FONT_SIZE_NUM = 10; // Reduced node label font size

// Threshold calculation removed
// const MEDIAN_THRESHOLD_MULTIPLIER = 0.97;

// Add margins for the graph
const MARGIN = { top: 30, right: 30, bottom: 30, left: 30 };

// Normalization Helper
const normalizeValue = (value: number, min: number, max: number): number => {
  if (max === min) return 0.5; // Avoid division by zero, return midpoint
  return (value - min) / (max - min); // Scale value to 0-1 range
}

// Add zoom control constants
const ZOOM_BUTTON_STEP = 0.2; // How much to zoom in/out per button click
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

// Color Legend Constants
const LEGEND_WIDTH = 200;
const LEGEND_HEIGHT = 10;
const LEGEND_MARGIN_TOP = 20;
const LEGEND_MARGIN_LEFT = 20;
const LEGEND_TITLE_FONT_SIZE = '10px';
const LEGEND_LABEL_FONT_SIZE = '9px';

export default function SimilarityGraph({ similarityMatrix, models, resolvedTheme }: SimilarityGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  useEffect(() => {
    console.log('[SimilarityGraph] useEffect triggered. Models count:', models?.length, 'Theme:', resolvedTheme);
    if (!svgRef.current || !models?.length) {
        console.log('[SimilarityGraph] useEffect aborting: no svgRef or models array.');
        return;
    };

    // Introduce a small delay to allow the browser to apply theme changes
    const timerId = setTimeout(() => {
      try {
        if (!svgRef.current) {
            console.log('[SimilarityGraph] Aborting inside setTimeout: svgRef became null.');
            return; 
        }

        console.log('[SimilarityGraph] 1. Initial models received:', models);

        // Clear any existing SVG content
        d3.select(svgRef.current).selectAll('*').remove();

        // Get computed theme colors
        const computedStyle = getComputedStyle(document.documentElement);
        
        const rawForegroundColor = computedStyle.getPropertyValue('--foreground').trim();
        console.log('[SimilarityGraph] (after timeout) Raw --foreground:', rawForegroundColor);
        const rawPrimaryColor = computedStyle.getPropertyValue('--primary').trim();
        console.log('[SimilarityGraph] (after timeout) Raw --primary:', rawPrimaryColor);
        const rawBackgroundColor = computedStyle.getPropertyValue('--background').trim();
        console.log('[SimilarityGraph] (after timeout) Raw --background:', rawBackgroundColor);

        const themeColors = {
          primary: `hsl(${rawPrimaryColor})`,
          muted: `hsl(${computedStyle.getPropertyValue('--muted').trim()})`,
          border: `hsl(${computedStyle.getPropertyValue('--border').trim()})`,
          foreground: `hsl(${rawForegroundColor})`,
          backgroundHslString: rawBackgroundColor,
          get linkLabelHalo() {
            const lightness = parseFloat(this.backgroundHslString.split(' ')[2].replace('%',''));
            return lightness > 50 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.75)';
          },
          get nodeStroke() { 
            let borderContrast = computedStyle.getPropertyValue('--border-contrast').trim();
            if (borderContrast.startsWith('var(')) {
                const nestedVarName = borderContrast.match(/var\((--[^\)]+)\)/)?.[1];
                if (nestedVarName) {
                    borderContrast = computedStyle.getPropertyValue(nestedVarName).trim();
                }
            }
            return borderContrast; 
          }
        };

        const svgEl = svgRef.current;
        const fullWidth = svgEl.clientWidth;
        const fullHeight = svgEl.clientHeight;

        const width = fullWidth - MARGIN.left - MARGIN.right;
        const height = fullHeight - MARGIN.top - MARGIN.bottom;
        const centerX = width / 2;
        const centerY = height / 2;

        const selectedVariants = new Map<string, { fullId: string; temperature?: number }>();
        models.forEach(modelId => {
          const parsed = parseEffectiveModelId(modelId);
          const existing = selectedVariants.get(parsed.baseId);
          if (!existing ||
              (existing.temperature === undefined && parsed.temperature !== undefined) ||
              (parsed.temperature !== undefined && existing.temperature !== undefined && parsed.temperature < existing.temperature)
          ) {
            selectedVariants.set(parsed.baseId, { fullId: modelId, temperature: parsed.temperature });
          }
        });
        let graphDisplayModels = Array.from(selectedVariants.values()).map(v => v.fullId);
        console.log('[SimilarityGraph] 2. Models after variant selection:', graphDisplayModels);
        
        // Filter out the Ideal Response model
        graphDisplayModels = graphDisplayModels.filter(modelId => {
          const parsed = parseEffectiveModelId(modelId);
          return parsed.baseId !== IDEAL_MODEL_ID_BASE;
        });

        console.log('[SimilarityGraph] 3. Models after filtering ideal response:', graphDisplayModels);

        if (graphDisplayModels.length < 2) {
            console.warn('[SimilarityGraph] 4. ABORTING: Not enough models to render graph after filtering.');
            const svg = d3.select(svgRef.current);
            svg.append('text')
                .attr('x', '50%')
                .attr('y', '50%')
                .attr('text-anchor', 'middle')
                .style('fill', 'hsl(var(--foreground))')
                .text('Not enough models to display similarity graph.');
            return;
        }

        const modelAverageSimilarities: { [modelId: string]: number } = {};
        let allAverageScores: number[] = [];
        // Use graphDisplayModels for average similarity calculation
        graphDisplayModels.forEach(modelId => {
            let totalSimilarity = 0;
            let count = 0;
            graphDisplayModels.forEach(otherModelId => {
                if (modelId === otherModelId) return;
                // Similarity is still looked up from the original matrix
                const sim = similarityMatrix[modelId]?.[otherModelId] ?? similarityMatrix[otherModelId]?.[modelId];
                if (typeof sim === 'number' && !isNaN(sim)) {
                    totalSimilarity += sim;
                    count++;
                }
            });
            const avgSim = count > 0 ? totalSimilarity / count : 0;
            modelAverageSimilarities[modelId] = avgSim;
            if (count > 0) { 
                allAverageScores.push(avgSim);
            }
        });
        
        console.log('[SimilarityGraph] 5. Calculated model average similarities:', modelAverageSimilarities);

        let minAvgSim = 0;
        let maxAvgSim = 1;
        if (allAverageScores.length > 0) {
            minAvgSim = Math.min(...allAverageScores);
            maxAvgSim = Math.max(...allAverageScores);
        }
        if (maxAvgSim - minAvgSim < 0.01) {
            minAvgSim = Math.max(0, minAvgSim - 0.05); 
            maxAvgSim = Math.min(1, maxAvgSim + 0.05); 
        }
        if (minAvgSim > maxAvgSim) {
            [minAvgSim, maxAvgSim] = [maxAvgSim, minAvgSim]; 
        }
        if (minAvgSim === maxAvgSim || minAvgSim > 1 || maxAvgSim < 0 || isNaN(minAvgSim) || isNaN(maxAvgSim)) {
             minAvgSim = 0;
             maxAvgSim = 1;
        }
        const colorScale = d3.scaleSequential(d3.interpolateViridis)
            .domain([minAvgSim, maxAvgSim]) 
            .clamp(true);

        console.log('[SimilarityGraph] 6. Color scale domain:', colorScale.domain());

        // Use graphDisplayModels for nodesData
        const nodesData = graphDisplayModels.map(model => ({
          id: model, // fullId is used as the D3 node ID
          name: getModelDisplayLabel(model), // getModelDisplayLabel handles fullId
          color: colorScale(modelAverageSimilarities[model] ?? 0)
        }));

        console.log('[SimilarityGraph] 7. Generated nodesData count:', nodesData.length, 'Example:', nodesData[0]);

        const linksData: { source: string; target: string; value: number }[] = [];
        // Use graphDisplayModels for linksData
        graphDisplayModels.forEach((model1, i) => {
          graphDisplayModels.forEach((model2, j) => {
            if (i < j && similarityMatrix[model1] && similarityMatrix[model1][model2] !== undefined) {
              let simValue = similarityMatrix[model1][model2];
              if (typeof simValue !== 'number' || isNaN(simValue)) {
                simValue = 0;
              }
              linksData.push({
                source: model1,
                target: model2,
                value: simValue
              });
            }
          });
        });

        console.log('[SimilarityGraph] 8. Generated linksData count:', linksData.length, 'Example:', linksData[0]);

        let minLinkSimilarity = 1.0;
        let maxLinkSimilarity = 0.0;
        if (linksData.length > 0) {
          minLinkSimilarity = Math.min(...linksData.map(link => link.value));
          maxLinkSimilarity = Math.max(...linksData.map(link => link.value));
        } else {
            minLinkSimilarity = 0.0;
            maxLinkSimilarity = 1.0;
        }
        const normalizedLinksData = linksData.map(link => ({
            ...link,
            normalizedValue: normalizeValue(link.value, minLinkSimilarity, maxLinkSimilarity)
        }));

        console.log('[SimilarityGraph] 9. Starting D3 simulation...');

        const simulation = d3.forceSimulation(nodesData as any)
          .force('link', d3.forceLink(normalizedLinksData as any)
            .id((d: any) => d.id)
            .distance((d: any) => FORCE_LINK_DISTANCE_MULTIPLIER * (1.05 - Math.pow(d.normalizedValue, SIMILARITY_EMPHASIS_FACTOR)))
            .strength((d: any) => Math.pow(d.normalizedValue, SIMILARITY_EMPHASIS_FACTOR) * FORCE_LINK_STRENGTH_MULTIPLIER)
          )
          .force('charge', d3.forceManyBody().strength(FORCE_CHARGE_STRENGTH))
          .force('center', d3.forceCenter(centerX, centerY))
          .force('collision', d3.forceCollide().radius(FORCE_COLLISION_RADIUS));

        const svg = d3.select(svgRef.current);
        const zoomControls = svg.append('g').attr('class', 'zoom-controls').attr('transform', `translate(${fullWidth - 80}, 20)`);
        
        // Zoom In button
        const zoomInButton = zoomControls.append('g').attr('class', 'zoom-button').style('cursor', 'pointer');
        zoomInButton.append('rect').attr('x', 0).attr('y', 0).attr('width', 30).attr('height', 30).attr('rx', 5).style('fill', themeColors.muted).style('stroke', themeColors.border);
        zoomInButton.append('text').attr('x', 15).attr('y', 20).attr('text-anchor', 'middle').style('fill', themeColors.foreground).text('+').style('font-size', '20px').style('user-select', 'none');

        // Zoom Out button
        const zoomOutButton = zoomControls.append('g').attr('class', 'zoom-button').attr('transform', 'translate(0, 40)').style('cursor', 'pointer');
        zoomOutButton.append('rect').attr('x', 0).attr('y', 0).attr('width', 30).attr('height', 30).attr('rx', 5).style('fill', themeColors.muted).style('stroke', themeColors.border);
        zoomOutButton.append('text').attr('x', 15).attr('y', 20).attr('text-anchor', 'middle').style('fill', themeColors.foreground).text('−').style('font-size', '20px').style('user-select', 'none');

        // Reset button
        const resetButton = zoomControls.append('g').attr('class', 'zoom-button').attr('transform', 'translate(0, 80)').style('cursor', 'pointer');
        resetButton.append('rect').attr('x', 0).attr('y', 0).attr('width', 30).attr('height', 30).attr('rx', 5).style('fill', themeColors.muted).style('stroke', themeColors.border);
        resetButton.append('text').attr('x', 15).attr('y', 18).attr('text-anchor', 'middle').style('fill', themeColors.foreground).text('⟲').style('font-size', '16px').style('user-select', 'none');

        const g = svg.append('g')
            .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`); // Apply margin translation
        gRef.current = g.node();

        const link = g.append('g').attr('class', 'links').selectAll('line')
          .data(normalizedLinksData).enter().append('line')
          .style('stroke', themeColors.primary)
          .attr('stroke-opacity', (d: any) => LINK_BASE_OPACITY + d.normalizedValue * (0.2 - LINK_BASE_OPACITY))
          .attr('stroke-width', (d: any) => d.normalizedValue * LINK_WIDTH_MULTIPLIER + LINK_WIDTH_BASE);

        const linkLabel = g.append('g').attr('class', 'link-labels').selectAll('text')
          .data(normalizedLinksData).enter().append('text')
          .text((d: any) => (typeof d.value === 'number' && !isNaN(d.value)) ? d.value.toFixed(3) : '-')
          .attr('font-size', LINK_LABEL_FONT_SIZE).attr('text-anchor', 'middle').attr('dy', LINK_LABEL_OFFSET_Y)
          .style('fill', themeColors.foreground).style('stroke', themeColors.linkLabelHalo)
          .style('stroke-width', 0.4).attr('stroke-linejoin', 'round');

        const node = g.append('g').attr('class', 'nodes').selectAll('.node')
          .data(nodesData).enter().append('g').attr('class', 'node')
          .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended) as any);
        
        node.append('circle').attr('r', NODE_RADIUS).attr('fill', (d: any) => d.color)
          .style('stroke', themeColors.nodeStroke).attr('stroke-width', NODE_STROKE_WIDTH);

        node.append('text').text((d: any) => d.name).attr('font-size', `${NODE_LABEL_FONT_SIZE_NUM}px`)
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .style('fill', themeColors.foreground).attr('font-weight', '500')
          .attr('pointer-events', 'none').attr('dy', `${NODE_RADIUS + NODE_LABEL_FONT_SIZE_NUM * 0.7}px`);

        node.append('title').text((d: any) => getModelDisplayLabel(d.id)); // d.id is already the fullId

        simulation.on('tick', () => {
          link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
              .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
          linkLabel.attr('x', (d: any) => (d.source.x + d.target.x) / 2).attr('y', (d: any) => (d.source.y + d.target.y) / 2);
          
          // Constrain nodes within the bounds (width and height here are the dimensions within margins)
          node.attr('transform', (d: any) => {
            d.x = Math.max(NODE_RADIUS, Math.min(width - NODE_RADIUS, d.x));
            d.y = Math.max(NODE_RADIUS, Math.min(height - NODE_RADIUS, d.y));
            return `translate(${d.x},${d.y})`;
          });
        });

        const zoomed = (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => g.attr('transform', event.transform.toString());
        const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
          .scaleExtent([MIN_ZOOM, MAX_ZOOM])
          // Adjust translateExtent to keep the graph within the viewable area, considering margins
          // The extent should allow panning such that the margined area (width, height) is viewable.
          // It means the top-left of the 'g' element can go from (0,0) to (fullWidth - width, fullHeight - height)
          // relative to the SVG, but since 'g' is already translated by MARGIN.left, MARGIN.top,
          // the zoom transform is applied on 'g'.
          // The translateExtent for 'g' should be relative to its own coordinate system after the initial margin translation.
          // Let's set it to ensure the content (width, height) doesn't pan too far out.
          // The content's origin is (0,0) within 'g'. It can pan until its bottom-right (width, height)
          // is at the SVG's MARGIN.left, MARGIN.top, and its top-left (0,0) is at SVG's fullWidth - MARGIN.right, fullHeight - MARGIN.bottom
          // This calculation seems tricky with the current setup. Let's try a simpler extent first.
          .translateExtent([[0, 0], [fullWidth, fullHeight]]) // This applies to the <g> element post-margin translation
          .on('zoom', zoomed);
        zoomRef.current = zoomBehavior;
        svg.call(zoomBehavior as any).on("wheel.zoom", null);

        zoomInButton.on('click', () => svg.transition().duration(300).call(zoomBehavior.scaleBy, 1 + ZOOM_BUTTON_STEP));
        zoomOutButton.on('click', () => svg.transition().duration(300).call(zoomBehavior.scaleBy, 1 - ZOOM_BUTTON_STEP));
        resetButton.on('click', () => svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity));

        const legend = svg.append('g').attr('class', 'color-legend').attr('transform', `translate(${LEGEND_MARGIN_LEFT}, ${LEGEND_MARGIN_TOP})`);
        legend.append('text').attr('class', 'legend-title').attr('x', 0).attr('y', -6)
          .style('fill', themeColors.foreground).style('font-size', LEGEND_TITLE_FONT_SIZE).style('font-weight', '600')
          .text('Avg. Similarity to Others');
        const legendScale = d3.scaleLinear().domain([minAvgSim, maxAvgSim]).range([0, LEGEND_WIDTH]);
        const legendAxis = d3.axisBottom(legendScale).ticks(5).tickFormat(d3.format(".2f")).tickSize(LEGEND_HEIGHT / 2);
        legend.append('g').attr('class', 'legend-axis').call(legendAxis).attr('transform', `translate(0, ${LEGEND_HEIGHT})`)
          .selectAll('text').style('font-size', LEGEND_LABEL_FONT_SIZE).style('fill', themeColors.foreground);
        legend.select('.domain').remove();
        const defs = svg.append('defs');
        const linearGradient = defs.append('linearGradient').attr('id', 'legend-gradient').attr('x1', '0%').attr('y1', '0%').attr('x2', '100%').attr('y2', '0%');
        const numStops = 10;
        const stopValues = d3.range(numStops + 1).map(i => minAvgSim + (i / numStops) * (maxAvgSim - minAvgSim));
        linearGradient.selectAll('stop').data(stopValues).enter().append('stop')
          .attr('offset', (d, i) => `${(i / numStops) * 100}%`).attr('stop-color', d => colorScale(d));
        legend.append('rect').attr('x', 0).attr('y', 0).attr('width', LEGEND_WIDTH).attr('height', LEGEND_HEIGHT)
          .style('fill', 'url(#legend-gradient)').style('stroke', themeColors.border).attr('stroke-width', 0.5);

        simulation.alpha(SIMULATION_INITIAL_ALPHA).restart();
        
        function dragstarted(event: any, d: any) { if (!event.active) simulation.alphaTarget(SIMULATION_DRAG_ALPHA_TARGET).restart(); d.fx = d.x; d.fy = d.y; }
        function dragged(event: any, d: any) { d.fx = event.x; d.fy = event.y; }
        function dragended(event: any, d: any) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }

        console.log('[SimilarityGraph] 10. Simulation started and elements appended.');

      } catch (error) {
        console.error('[SimilarityGraph] Error during graph rendering:', error);
        // Optionally, display an error message in the SVG
        if (svgRef.current) {
          const svg = d3.select(svgRef.current);
          svg.selectAll('*').remove(); // Clear previous content
          svg.append('text')
            .attr('x', '50%')
            .attr('y', '50%')
            .attr('text-anchor', 'middle')
            .style('fill', 'red')
            .text('Could not render graph.');
        }
      }
    }, 100); // Increased timeout slightly to ensure theme is applied

    return () => {
      clearTimeout(timerId);
      // Stop simulation and remove zoom listeners if the main effect dependencies change or component unmounts
      // Access simulation and zoomBehavior from refs if they are stored there, or ensure they are in scope
      // For now, assuming simulation.stop() is fine if simulation is defined in this scope
      // d3.select(svgRef.current) might be null here if component unmounted fast. Add a guard.
      if (svgRef.current && zoomRef.current) {
         d3.select(svgRef.current).on('.zoom', null);
      }
      // If simulation is a top-level const in setTimeout, it won't be accessible here for .stop()
      // This needs careful handling of D3 object lifecycles with React.
      // For now, the primary goal is to ensure re-render fetches new styles.
      // A full cleanup of D3 might require storing simulation in a ref.
    };
  }, [similarityMatrix, models, resolvedTheme]) 

  return (
    <div className="relative w-full h-full bg-card rounded-lg border border-border">
      <svg ref={svgRef} className="w-full h-full"></svg>
    </div>
  )
} 