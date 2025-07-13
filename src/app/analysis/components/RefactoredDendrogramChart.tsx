'use client';

import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useAnalysis } from '../context/AnalysisContext';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';

const hclust = require('ml-hclust');

const RefactoredDendrogramChart = () => {
    const { data, modelsForAggregateView: models } = useAnalysis();
    const svgRef = useRef<SVGSVGElement>(null);
    const similarityMatrix = data?.evaluationResults?.similarityMatrix;

    useEffect(() => {
        if (!svgRef.current || !models || models.length < 2 || !similarityMatrix) return;

        // 1. Convert Similarity Matrix to Distance Matrix
        const distanceMatrix: number[][] = [];
        models.forEach((model1, i) => {
            distanceMatrix[i] = [];
            models.forEach((model2, j) => {
                if (i === j) {
                    distanceMatrix[i][j] = 0;
                } else {
                    let simScore = similarityMatrix[model1]?.[model2] ?? similarityMatrix[model2]?.[model1];
                    if (typeof simScore !== 'number' || isNaN(simScore)) {
                        simScore = 0;
                    }
                    distanceMatrix[i][j] = 1 - simScore;
                }
            });
        });

        // 2. Perform Hierarchical Clustering
        let clusters;
        try {
            clusters = hclust.agnes(distanceMatrix, { method: 'ward' });
        } catch (error) {
            console.error("Error during hierarchical clustering:", error);
            d3.select(svgRef.current).selectAll('*').remove();
            d3.select(svgRef.current).append('text')
                .attr('x', 10).attr('y', 20).text('Error creating dendrogram.');
            return;
        }
        
        if (!clusters) { 
            console.error("Clustering did not produce a valid result.");
            d3.select(svgRef.current).selectAll('*').remove();
            d3.select(svgRef.current).append('text')
                .attr('x', 10).attr('y', 20).text('Could not generate dendrogram structure.');
            return;
        }

        // 3. Convert Cluster Data to D3 Hierarchy Format
        function convertClusterToHierarchy(node: any): any {
            if (!node) return null; 
            if (node.isLeaf) {
                return { name: getModelDisplayLabel(models[node.index]), index: node.index };
            } 
            if (!Array.isArray(node.children)) return null;
            
            const validChildren = node.children.map((child: any) => convertClusterToHierarchy(child)).filter((c: any) => c != null);
            
            if (validChildren.length === 0 && !node.isLeaf) return null;
            
            return { 
                name: `cluster-${node.height.toFixed(3)}`,
                children: validChildren,
                heightValue: node.height
            };
        }

        const rootHierarchyData = convertClusterToHierarchy(clusters);

        if (!rootHierarchyData) {
            console.error("Failed to convert cluster data into a valid hierarchy root.");
            d3.select(svgRef.current).selectAll('*').remove();
            d3.select(svgRef.current).append('text')
                .attr('x', 10).attr('y', 20).text('Could not process clustering results.');
            return;
        }

        // 4. Setup D3 Layout
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove(); 

        const width = svgRef.current.clientWidth;
        const height = svgRef.current.clientHeight;
        const margin = { top: 20, right: 250, bottom: 20, left: 40 }; 
        const plotWidth = width - margin.left - margin.right;
        const plotHeight = height - margin.top - margin.bottom;

        const clusterLayout = d3.cluster().size([plotHeight, plotWidth]);

        const rootNode = d3.hierarchy(rootHierarchyData, d => d.children);
        clusterLayout(rootNode);

        const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

        // 5. Draw Links
        const linkGenerator = d3.linkHorizontal()
            .x((d: any) => d.y)
            .y((d: any) => d.x);

        g.selectAll('path.link')
            .data(rootNode.links())
            .enter()
            .append('path')
            .attr('class', 'link')
            .attr('d', linkGenerator as any)
            .attr('fill', 'none')
            .attr('stroke', '#9ca3af')
            .attr('stroke-width', 1.5);

        // 6. Draw Nodes and Labels
        const node = g.selectAll('g.node')
            .data(rootNode.descendants())
            .enter()
            .append('g')
            .attr('class', d => `node ${d.children ? 'node--internal' : 'node--leaf'}`)
            .attr('transform', (d: any) => `translate(${d.y},${d.x})`);

        node.append('circle')
            .attr('r', 3.5)
            .attr('fill', d => d.children ? '#6b7280' : '#3b82f6')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1);

        node.filter(d => !d.children)
            .append('text')
            .attr('dy', '0.31em')
            .attr('x', 8)
            .attr('text-anchor', 'start') 
            .style('font-size', '12px')
            .style('fill', 'hsl(var(--foreground))')
            .text((d: any) => d.data.name);

    }, [similarityMatrix, models]);

    if (!similarityMatrix || !models || models.length < 2) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                No similarity data available for dendrogram.
            </div>
        );
    }

    return (
        <div className="w-full h-full">
            <svg ref={svgRef} className="w-full h-full"></svg>
        </div>
    );
};

export default RefactoredDendrogramChart; 