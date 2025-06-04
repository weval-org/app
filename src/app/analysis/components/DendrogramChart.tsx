'use client'

import React, { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const hclust = require('ml-hclust');

import { getModelDisplayLabel } from '../../utils/modelIdUtils';

interface DendrogramChartProps {
  similarityMatrix: Record<string, Record<string, number>>
  models: string[]
}

export default function DendrogramChart({ similarityMatrix, models }: DendrogramChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !models || models.length < 2) return;

    // 1. Convert Similarity Matrix to Distance Matrix
    // Using distance = 1 - similarity
    const distanceMatrix: number[][] = [];
    models.forEach((model1, i) => {
      distanceMatrix[i] = [];
      models.forEach((model2, j) => {
        if (i === j) {
          distanceMatrix[i][j] = 0;
        } else {
          // Ensure symmetry and handle potential missing values, including NaN
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
        // Using AGNES (Agglomerative Nesting) - a common bottom-up approach
        clusters = hclust.agnes(distanceMatrix, {
            method: 'ward' // Ward's linkage minimizes variance within clusters
        });
    } catch (error) {
        console.error("Error during hierarchical clustering:", error);
        // Clear SVG and maybe show an error message
        d3.select(svgRef.current).selectAll('*').remove();
        d3.select(svgRef.current).append('text')
            .attr('x', 10)
            .attr('y', 20)
            .text('Error creating dendrogram.');
        return;
    }
    
    // Check if clustering produced a valid result (check if the root object exists)
    if (!clusters) { 
        console.error("Clustering did not produce a valid result (root object is null/undefined).");
        d3.select(svgRef.current).selectAll('*').remove();
        d3.select(svgRef.current).append('text')
            .attr('x', 10)
            .attr('y', 20)
            .text('Could not generate dendrogram structure.');
        return;
    }

    // 3. Convert Cluster Data to D3 Hierarchy Format
    // The ml-hclust output needs to be recursively converted
    function convertClusterToHierarchy(node: any): any {
        // console.log(`${indent}Processing node:`, node ? {isLeaf: node.isLeaf, index: node.index, height: node.height, childrenCount: node.children?.length} : node);
        
        // Add check for undefined node to prevent runtime error
        if (!node) {
            // console.warn(`${indent}Node is null/undefined.`);
            return null; 
        }
        
        if (node.isLeaf) {
             // console.log(`${indent}Node is leaf, index: ${node.index}, model: ${models[node.index]}`);
            return { name: getModelDisplayLabel(models[node.index]), index: node.index }; // Use new utility
        } 
        
        // Check if children array exists before mapping
        if (!Array.isArray(node.children)) {
            // console.warn(`${indent}Node is not leaf but has no children array:`, node);
            return null; // Treat as invalid
        }
        
        // Ensure children are processed recursively
        const children = node.children.map((child: any) => convertClusterToHierarchy(child));
        // console.log(`${indent}Processed children results:`, children);
        
        // Filter out any null/undefined children just in case
        const validChildren = children.filter((c: any) => c != null);
        // console.log(`${indent}Valid children after filter:`, validChildren);
        
        // If a non-leaf node has no valid children after filtering, treat it as invalid (return null)
        if (validChildren.length === 0 && !node.isLeaf) {
        //   console.warn(`${indent}Non-leaf cluster node ended up with no valid children:`, node);
          return null;
        }
        
        // console.log(`${indent}Returning internal node: cluster-${node.height.toFixed(3)}`);
        return { 
            name: `cluster-${node.height.toFixed(3)}`, // Internal node name
            children: validChildren,
            heightValue: node.height // Store the height (distance) for scaling
        };
    }

    // Start conversion directly from the clusters object (which is the root node)
    // console.log("Starting hierarchy conversion from root object...");
    const rootHierarchyData = convertClusterToHierarchy(clusters);
    // console.log("Final rootHierarchyData:", rootHierarchyData);

    if (!rootHierarchyData) {
        console.error("Failed to convert cluster data into a valid hierarchy root.");
        d3.select(svgRef.current).selectAll('*').remove();
        d3.select(svgRef.current).append('text')
            .attr('x', 10)
            .attr('y', 20)
            .text('Could not process clustering results for hierarchy.');
        return;
    }

    // 4. Setup D3 Layout
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove(); // Clear previous render

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;
    // Increased right margin for labels
    const margin = { top: 20, right: 250, bottom: 20, left: 40 }; 
    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;

    // Use d3.cluster for dendrogram layout
    // The size determines the layout area. We swap height and width because 
    // dendrograms are often drawn horizontally (root left, leaves right).
    const clusterLayout = d3.cluster()
        .size([plotHeight, plotWidth]); // [height, width] for horizontal layout

    const rootNode = d3.hierarchy(rootHierarchyData, d => d.children);
    clusterLayout(rootNode);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // 5. Draw Links (Paths)
    // Use a path generator for the elbow-shaped links
    const linkGenerator = d3.linkHorizontal()
        .x((d: any) => d.y) // x-position is based on depth/distance (mapped to width)
        .y((d: any) => d.x); // y-position is based on cluster arrangement (mapped to height)

    g.selectAll('path.link')
        .data(rootNode.links())
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('d', linkGenerator as any)
        .attr('fill', 'none')
        .attr('stroke', '#9ca3af') // Darker grey for links (Tailwind gray-400)
        .attr('stroke-width', 1.5);

    // 6. Draw Nodes and Labels
    const node = g.selectAll('g.node')
        .data(rootNode.descendants()) // Use descendants to get all nodes
        .enter()
        .append('g')
        .attr('class', d => `node ${d.children ? 'node--internal' : 'node--leaf'}`)
        .attr('transform', (d: any) => `translate(${d.y},${d.x})`); // Swap x and y for horizontal

    // Add circles for ALL nodes
    node.append('circle')
      .attr('r', 3.5) // Slightly larger radius
      .attr('fill', d => d.children ? '#6b7280' : '#3b82f6') // Darker grey for internal, blue for leaf (Tailwind gray-500, blue-500)
      .attr('stroke', '#fff') // White stroke for contrast
      .attr('stroke-width', 1);

    // Add labels for leaf nodes (models)
    node.filter(d => !d.children)
        .append('text')
        .attr('dy', '0.31em')
        .attr('x', 8) // Position text to the right of the leaf node position
        .attr('text-anchor', 'start') 
        .style('font-size', '12px') // Slightly larger font size
        .style('fill', 'hsl(var(--foreground))') // Use CSS custom property for theme-aware text color
        .text((d: any) => d.data.name); // This will now use the formatted name from hierarchy data

  }, [similarityMatrix, models]);

  return (
    <div className="w-full h-[600px]"> {/* Adjust height as needed */}
      <svg ref={svgRef} width="100%" height="90%"></svg> {/* SVG takes most of the div height */}
    </div>
  );
}