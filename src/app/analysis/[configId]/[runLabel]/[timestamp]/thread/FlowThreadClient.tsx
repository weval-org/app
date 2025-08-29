'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  useNodesState,
  useEdgesState,
  addEdge,
  MiniMap,
  Controls,
  Background,
  Node,
  Edge,
  Position,
  ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import ELK from 'elkjs/lib/elk.bundled.js';

import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import { parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import MessageNode from './MessageNode';
import CollapsedNode from './CollapsedNode';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const nodeTypes = { 
    message: MessageNode,
    collapsed: CollapsedNode,
};

const elk = new ELK();

const elkOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.spacing.nodeNode': '120', // Increased vertical spacing
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
};

// Estimates node height based on content to prevent overlaps
const estimateNodeHeight = (nodeData: any): number => {
    // If this node contains multiple responses, calculate the max height
    if (Array.isArray(nodeData.responses) && nodeData.responses.length > 0) {
        const heights = nodeData.responses.map((response: any) => {
            const { text = '' } = response;
            const chromeHeight = 84; // Header (33) + Content padding (16) + Footer (35)
            const lineHeight = 17;
            const charsPerLine = 52;
            const hardBreaks = (text.match(/\n/g) || []).length;
            const softLines = Math.max(1, Math.ceil(text.length / charsPerLine));
            const lines = Math.max(softLines, hardBreaks + 1);
            const textHeight = lines * lineHeight;
            return chromeHeight + textHeight;
        });
        const maxHeight = Math.max(...heights);
        return Math.min(800, Math.max(105, maxHeight)); // Ensure a reasonable min/max
    }

    // Fallback for single-response or user/context nodes
    const { text = '' } = nodeData;
    const chromeHeight = 49; // Header (33px) + Content padding (16px)
    const lineHeight = 17; // Based on prose-sm styling in MessageNode
    const charsPerLine = 52; // Approximation based on width (w-72) and font size

    const hardBreaks = (text.match(/\n/g) || []).length;
    const softLines = Math.max(1, Math.ceil(text.length / charsPerLine));
    
    const lines = Math.max(softLines, hardBreaks + 1);
    const textHeight = lines * lineHeight;
    
    const totalHeight = chromeHeight + textHeight;
    
    // Set a reasonable min/max to prevent tiny or gigantic nodes
    return Math.min(800, Math.max(70, totalHeight)); 
};


const getLayoutedElements = async (nodes: Node[], edges: Edge[]) => {
  const graph: any = {
    id: 'root',
    layoutOptions: elkOptions,
    children: nodes.map((node) => ({
      ...node,
      width: node.type === 'collapsed' ? 150 : 500,
      height: node.type === 'collapsed' ? 32 : estimateNodeHeight(node.data),
    })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };

  const layoutedGraph: any = await elk.layout(graph);
  
  return {
    nodes: (layoutedGraph.children || []).map((node: any) => ({
      ...node,
      position: { x: node.x, y: node.y },
    })),
    // Preserve original React Flow edges; ELK edges are a different type
    edges,
  };
};


type Role = 'system' | 'user' | 'assistant';

function normalizeForKey(text: string): string {
  return (text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


const FlowThreadClient: React.FC = () => {
  const { data, fetchPromptResponses } = useAnalysis();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<string>>(new Set());
  const [collapseChains, setCollapseChains] = useState<boolean>(true);
  const [visibleModels, setVisibleModels] = useState<Set<string>>(new Set());
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const promptIds = useMemo(() => data?.promptIds || [], [data?.promptIds]);
  const availablePromptIds = useMemo(() => {
    const cfgIds: string[] = Array.isArray((data as any)?.config?.prompts)
      ? ((data as any).config.prompts.map((p: any) => p?.id).filter(Boolean))
      : [];
    const merged = cfgIds.length > 0 ? cfgIds : promptIds;
    return merged.filter((pid: string) => (data as any)?.promptContexts?.[pid] !== undefined);
  }, [data, promptIds]);

  // Initialize selection to first prompt
  useEffect(() => {
    if (!data) return;
    if (selectedPromptIds.size === 0 && availablePromptIds.length > 0) {
      setSelectedPromptIds(new Set([availablePromptIds[0]]));
    }
  }, [data, availablePromptIds, selectedPromptIds.size]);

  useEffect(() => {
    console.log('Graph generation effect triggered.');
    console.log('Data available:', !!data);
    console.log('Selected Prompt IDs:', selectedPromptIds);

    if (!data || selectedPromptIds.size === 0) {
        setNodes([]);
        setEdges([]);
        return;
    };

    let cancelled = false;
    const generateGraph = async () => {
      setLoading(true);
      console.log('Starting graph generation...');
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];
      const nodeMap = new Map<string, Node>();
      const edgeIdSet = new Set<string>();

      const sourcePids = Array.from(selectedPromptIds);

      for (const pid of sourcePids) {
        const ctx = (data as any).promptContexts?.[pid];
        let pathKeys: string[] = [];
        let messageIdx = 0;

        const processMessage = (role: Role, content: string, extra: object = {}) => {
            const key = `${messageIdx}|${role}::${normalizeForKey(content)}`;
            if (!nodeMap.has(key)) {
                const node: Node = {
                    id: key,
                    type: 'message',
                    position: { x: 0, y: 0 }, // Position will be set by ELK
                    data: { 
                        role,
                        text: content,
                        isContext: true, 
                        ...extra 
                    },
                    sourcePosition: Position.Right,
                    targetPosition: Position.Left,
                };
                nodeMap.set(key, node);
                newNodes.push(node);
            }
            pathKeys.push(key);
            messageIdx++;
        };

        if (Array.isArray(ctx)) {
            for (const m of ctx) {
                const role = (m.role || 'user') as Role;
                if (!['system', 'user', 'assistant'].includes(role)) continue;
                const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
                processMessage(role, content);
            }
        } else if (typeof ctx === 'string') {
            processMessage('user', String(ctx));
        }

        // Link context messages
        for (let i = 0; i < pathKeys.length - 1; i++) {
            const edgeId = `${pathKeys[i]}-${pathKeys[i+1]}`;
            if (!edgeIdSet.has(edgeId)) {
              newEdges.push({ id: edgeId, source: pathKeys[i], target: pathKeys[i+1] });
              edgeIdSet.add(edgeId);
            }
        }
        
        // Append model responses
        const respMap = await fetchPromptResponses(pid);
        if (cancelled) return;

        if (respMap) {
            const prevKey = pathKeys[pathKeys.length - 1];

            // Group responses by base model ID
            const responsesByBaseId = new Map<string, any[]>();
            for (const [modelId, text] of Object.entries(respMap)) {
                const parsed = parseModelIdForDisplay(modelId);
                if (typeof text !== 'string' || !visibleModels.has(parsed.baseId)) continue;
                
                if (!responsesByBaseId.has(parsed.baseId)) {
                    responsesByBaseId.set(parsed.baseId, []);
                }
                responsesByBaseId.get(parsed.baseId)!.push({
                    text,
                    fullModelId: modelId,
                    temperature: parsed.temperature,
                });
            }

            for (const [baseId, responses] of responsesByBaseId.entries()) {
                const key = `${prevKey}::${baseId}`;
                 if (!nodeMap.has(key)) {
                    const node: Node = {
                        id: key,
                        type: 'message',
                        position: { x: 0, y: 0 },
                        data: { 
                            role: 'assistant',
                            baseModelId: baseId,
                            responses: responses,
                            promptId: pid,
                            isContext: false,
                        },
                        sourcePosition: Position.Right,
                        targetPosition: Position.Left,
                    };
                    nodeMap.set(key, node);
                    newNodes.push(node);
                }

                if (prevKey) {
                  const edgeId = `${prevKey}-${key}`;
                  if (!edgeIdSet.has(edgeId)) {
                    newEdges.push({ id: edgeId, source: prevKey, target: key });
                    edgeIdSet.add(edgeId);
                  }
                }
            }
        }
      }

      console.log(`Processed data into ${newNodes.length} nodes and ${newEdges.length} edges.`);

      let finalNodes = newNodes;
      let finalEdges = newEdges;

      if (collapseChains) {
          const { collapsedNodes, collapsedEdges } = getCollapsedGraph(newNodes, newEdges, () => setCollapseChains(false));
          finalNodes = collapsedNodes;
          finalEdges = collapsedEdges;
      }

      if (!cancelled) {
        if (finalNodes.length === 0) {
            console.log('No nodes to layout, setting empty graph.');
            setNodes([]);
            setEdges([]);
            setLoading(false);
            return;
        }
        console.log('Applying layout...');
        getLayoutedElements(finalNodes, finalEdges).then(({ nodes: layoutedNodes, edges: layoutedEdges }) => {
            console.log('Layout complete. Setting state.', { layoutedNodes, layoutedEdges });
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
            setLoading(false);
        });
      }
    };

    generateGraph();
    return () => { cancelled = true; };
  }, [data, selectedPromptIds, fetchPromptResponses, visibleModels, collapseChains]);

  // Add coverage scores to nodes after they are generated
  useEffect(() => {
    if (!data?.evaluationResults?.llmCoverageScores) return;

    const coverageScores = (data.evaluationResults.llmCoverageScores as Record<string, any>);

    setNodes(currentNodes => {
        return currentNodes.map(node => {
            if (node.data.role === 'assistant' && !node.data.isContext && Array.isArray(node.data.responses)) {
                
                const promptId = node.data.promptId;
                const promptScores = coverageScores[promptId];

                if (promptScores) {
                    const updatedResponses = node.data.responses.map((response: any) => {
                        const result = promptScores[response.fullModelId];
                        const score = result?.avgCoverageExtent;
                        if (typeof score === 'number' && !isNaN(score)) {
                            return {
                                ...response,
                                coverage: Math.round(score * 100),
                            };
                        }
                        return response;
                    });

                    return {
                        ...node,
                        data: {
                            ...node.data,
                            responses: updatedResponses,
                        }
                    };
                }
            }
            return node;
        });
    });
  }, [nodes.length, data]);


  useEffect(() => {
    if (rfInstance && nodes.length > 0) {
      rfInstance.fitView({ padding: 0.1, duration: 200 });
    }
  }, [nodes.length, rfInstance]);

  const togglePrompt = (pid: string) => {
    setSelectedPromptIds(prev => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      if (next.size === 0 && availablePromptIds.length > 0) {
        next.add(availablePromptIds[0]);
      }
      return next;
    });
  };

  const getPromptLabel = (pid: string) => {
    // Basic label for now
    return pid;
  }

  const allModels = useMemo(() => {
    if (!data) return [];
    const modelSet = new Set<string>();
    data.effectiveModels.forEach(m => {
        const { baseId } = parseModelIdForDisplay(m);
        modelSet.add(baseId);
    });
    return Array.from(modelSet).sort();
  }, [data]);

  useEffect(() => {
    if(allModels.length > 0) {
        setVisibleModels(new Set([allModels[0]]));
    }
  }, [allModels]);

  const toggleModelVisibility = (modelId: string) => {
    setVisibleModels(prev => {
        const next = new Set(prev);
        if (next.has(modelId)) {
            next.delete(modelId);
        } else {
            next.add(modelId);
        }
        return next;
    });
  };

  if (!data) {
    return <div className="p-4">Loading analysis data...</div>;
  }

  console.log('Rendering FlowThreadClient with nodes:', nodes);

  return (
    <div className="w-full flex flex-col" style={{ height: '80vh' }}>
       <div className="p-2 border-b space-y-2">
         <div className="flex items-center gap-2">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="text-xs">Prompts ({selectedPromptIds.size} / {availablePromptIds.length} selected)</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-96 overflow-y-auto">
                    <DropdownMenuLabel>Select Prompts to Display</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {availablePromptIds.map((pid) => (
                        <DropdownMenuCheckboxItem
                            key={pid}
                            checked={selectedPromptIds.has(pid)}
                            onSelect={(e) => e.preventDefault()} // Prevent menu from closing on click
                            onCheckedChange={() => togglePrompt(pid)}
                        >
                            {getPromptLabel(pid)}
                        </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="text-xs">Models ({visibleModels.size} / {allModels.length} selected)</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="max-h-96 overflow-y-auto">
                    <DropdownMenuLabel>Select Models to Display</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {allModels.map(modelId => (
                         <DropdownMenuCheckboxItem
                            key={modelId}
                            checked={visibleModels.has(modelId)}
                            onSelect={(e) => e.preventDefault()}
                            onCheckedChange={() => toggleModelVisibility(modelId)}
                        >
                            {modelId}
                        </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <label className="flex items-center gap-1 text-xs cursor-pointer ml-auto p-2 rounded-md hover:bg-muted">
                <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={collapseChains}
                    onChange={(e) => setCollapseChains(e.target.checked)}
                />
                Collapse simple chains
            </label>
         </div>
       </div>
        {loading && <div className="p-4">Building graph...</div>}
        <div className="flex-grow">
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                onInit={setRfInstance}
                fitView
            >
                <MiniMap />
                <Controls />
                <Background />
            </ReactFlow>
      </div>
    </div>
  );
};

// --- Chain Collapsing Logic ---

const getCollapsedGraph = (nodes: Node[], edges: Edge[], expandCallback: () => void) => {
    if (nodes.length < 3) return { collapsedNodes: nodes, collapsedEdges: edges };

    const MIN_COLLAPSE_COUNT = 3; // only collapse when 3 or more messages are in the middle

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const outEdges = new Map<string, string[]>();
    const inEdges = new Map<string, string[]>();
    edges.forEach(edge => {
        if (!outEdges.has(edge.source)) outEdges.set(edge.source, []);
        outEdges.get(edge.source)!.push(edge.target);
        if (!inEdges.has(edge.target)) inEdges.set(edge.target, []);
        inEdges.get(edge.target)!.push(edge.source);
    });

    const isKept = (node: Node): boolean => {
        const outDegree = outEdges.get(node.id)?.length || 0;
        const inDegree = inEdges.get(node.id)?.length || 0;
        const isMultiVariant = Array.isArray(node.data.responses) && node.data.responses.length > 1;
        // Keep if this node is a branching/terminal OR contains multiple variants.
        // Interior linear context nodes (in=1,out=1) are allowed to collapse.
        return isMultiVariant || outDegree !== 1 || inDegree !== 1;
    };

    const keptNodeIds = new Set<string>(nodes.filter(isKept).map(n => n.id));

    const collapsedNodes: Node[] = nodes.filter(n => keptNodeIds.has(n.id));
    const collapsedEdges: Edge[] = [];
    const addedEdgeKeys = new Set<string>();
    let collapsedCounter = 0;

    const addEdgeOnce = (source: string, target: string) => {
        const key = `${source}->${target}`;
        if (addedEdgeKeys.has(key)) return;
        addedEdgeKeys.add(key);
        collapsedEdges.push({ id: key, source, target });
    };

    // Walk forward from each kept node along each outgoing edge until the next kept node
    for (const start of collapsedNodes) {
        const nexts = outEdges.get(start.id) || [];
        for (const first of nexts) {
            let currentId = first;
            let hiddenCount = 0;
            const chain: string[] = [];
            const visited = new Set<string>();
            visited.add(start.id);

            // Follow linear chains only; stop if branch or loop
            while (true) {
                if (visited.has(currentId)) break; // prevent loops
                visited.add(currentId);

                const isCurrentKept = keptNodeIds.has(currentId);
                if (isCurrentKept) {
                    if (hiddenCount < MIN_COLLAPSE_COUNT) {
                        // Preserve original small chain: include chain nodes and edges
                        // Add chain nodes (if not already kept)
                        chain.forEach(id => {
                            if (!keptNodeIds.has(id)) {
                                keptNodeIds.add(id);
                                const n = nodeMap.get(id);
                                if (n) collapsedNodes.push(n);
                            }
                        });
                        // Add edges along chain
                        let prevId = start.id;
                        for (const id of chain) {
                            addEdgeOnce(prevId, id);
                            prevId = id;
                        }
                        addEdgeOnce(prevId, currentId);
                    } else {
                        const collapsedId = `collapsed-${collapsedCounter++}`;
                        collapsedNodes.push({
                            id: collapsedId,
                            type: 'collapsed',
                            position: { x: 0, y: 0 },
                            data: { count: hiddenCount, onClick: expandCallback },
                        });
                        addEdgeOnce(start.id, collapsedId);
                        addEdgeOnce(collapsedId, currentId);
                    }
                    break;
                }

                // If current is not kept, it must be strictly linear to continue
                const outs = outEdges.get(currentId) || [];
                const ins = inEdges.get(currentId) || [];
                if (outs.length !== 1 || ins.length !== 1) {
                    // Branching within hidden chain
                    if (hiddenCount < MIN_COLLAPSE_COUNT) {
                        // Preserve chain up to currentId, then connect to branch node
                        chain.forEach(id => {
                            if (!keptNodeIds.has(id)) {
                                keptNodeIds.add(id);
                                const n = nodeMap.get(id);
                                if (n) collapsedNodes.push(n);
                            }
                        });
                        let prevId = start.id;
                        for (const id of chain) {
                            addEdgeOnce(prevId, id);
                            prevId = id;
                        }
                        addEdgeOnce(prevId, currentId);
                    } else {
                        const collapsedId = `collapsed-${collapsedCounter++}`;
                        collapsedNodes.push({
                            id: collapsedId,
                            type: 'collapsed',
                            position: { x: 0, y: 0 },
                            data: { count: hiddenCount, onClick: expandCallback },
                        });
                        addEdgeOnce(start.id, collapsedId);
                        addEdgeOnce(collapsedId, currentId);
                    }
                    break;
                }
                hiddenCount += 1;
                chain.push(currentId);
                currentId = outs[0];
            }
        }
    }

    return { collapsedNodes, collapsedEdges };
};

export default FlowThreadClient;
