'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ComparisonDataV2, CoverageResult } from '@/app/utils/types';
import { parseModelIdForDisplay, getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import Link from 'next/link';

interface Props {
    configId: string;
    runLabel: string;
    timestamp: string;
    data: ComparisonDataV2;
}



function computeAverages(data: ComparisonDataV2) {
    const promptIds = data.promptIds || [];
    const scores = data.evaluationResults?.llmCoverageScores as Record<string, Record<string, CoverageResult>> | undefined;
    if (!scores) return { promptOrder: [], perPromptAvg: [] as number[], overallAvg: null as number | null };

    // Collapse to base model IDs (ignore IDEAL and variant markers)
    const effectiveModels = (data.effectiveModels || []).filter(m => m !== IDEAL_MODEL_ID);
    const baseByModel = new Map<string, string>();
    effectiveModels.forEach(m => {
        const parsed = parseModelIdForDisplay(m);
        baseByModel.set(m, parsed.baseId);
    });

    // Ensure numeric ordering for strawberry N
    const sortedPids = [...promptIds].sort((a, b) => {
        const na = Number(a), nb = Number(b);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return String(a).localeCompare(String(b));
    });

    const perPromptAvg: number[] = [];
    const promptOrder: string[] = [];

    for (const pid of sortedPids) {
        const row = scores[pid] || {};
        // group by base model and average its variants
        const baseToVals = new Map<string, number[]>();
        for (const modelId of Object.keys(row)) {
            const coverage = row[modelId];
            if (!coverage || 'error' in coverage) continue;
            const v = typeof coverage.avgCoverageExtent === 'number' ? coverage.avgCoverageExtent : null;
            if (v === null || Number.isNaN(v)) continue;
            const base = baseByModel.get(modelId);
            if (!base) continue;
            if (!baseToVals.has(base)) baseToVals.set(base, []);
            baseToVals.get(base)!.push(v);
        }
        const perBase = Array.from(baseToVals.values()).map(arr => arr.reduce((a, b) => a + b, 0) / arr.length);
        const mean = perBase.length ? perBase.reduce((a, b) => a + b, 0) / perBase.length : NaN;
        if (!Number.isNaN(mean)) {
            promptOrder.push(pid);
            perPromptAvg.push(mean);
        }
    }

    const overallAvg = perPromptAvg.length ? perPromptAvg.reduce((a, b) => a + b, 0) / perPromptAvg.length : null;
    return { promptOrder, perPromptAvg, overallAvg };
}



function StrawberryCanvas({ values, size = 100, scale = 3 }: { values: number[]; size?: number; scale?: number }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    // Animation state: alignT goes 0 -> 1 on hover (1 = perfectly aligned)
    const alignTRef = useRef(0);
    const targetTRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number | null>(null);
    const mountedRef = useRef(false);

    // Load base strawberry image from public dir
    useEffect(() => {
        const image = new Image();
        image.src = '/strawberry.png';
        image.onload = () => setImg(image);
        return () => { setImg(null); };
    }, []);

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas || !img) return;
        // Render at native small resolution and scale up via CSS for pixelation
        const px = size; // destination square size (canvas pixels)
        canvas.width = px;
        canvas.height = px;
        canvas.style.width = `${size * scale}px`;
        canvas.style.height = `${size * scale}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        (ctx as any).imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, px, px);

        const maxShift = 20; // pixels at worst
        const rows = px; // number of destination scanlines
        const srcW = img.width;
        const srcH = img.height;

        // For each destination scanline sy, pick a corresponding score index
        for (let sy = 0; sy < rows; sy++) {
            const idx = values.length > 1 ? Math.floor((sy * (values.length - 1)) / (rows - 1)) : 0;
            const raw = values[idx] ?? 0;
            // Interpolate toward ideal using alignTRef (1 = ideal)
            const score = raw; // base score from data

            // Deterministic jitter per row
            const s = Math.abs(Math.sin((sy + 1) * 12.9898) * 43758.5453);
            const dir = (s - Math.floor(s)) < 0.5 ? -1 : 1;
            const jitterBase = dir * maxShift * (1 - score);
            const jitter = Math.round(jitterBase * (1 - alignTRef.current));

            // Map destination scanline to source scanline
            const srcY = Math.floor((sy * (srcH - 1)) / (rows - 1));
            // Draw 1px-tall slice from source row srcY to destination row sy, shifted by jitter
            // Source rect: (0, srcY, srcW, 1); Dest rect: (jitter, sy, px, 1)
            // Canvas handles clipping automatically when jitter pushes out of bounds
            ctx.drawImage(img, 0, srcY, srcW, 1, jitter, sy, px, 1);
        }
    };

    useEffect(() => {
        draw();
        if (!mountedRef.current && img) {
            mountedRef.current = true;
            // Entrance animation: quickly align to ~0.85 then slide back to 0
            // Phase 1
            targetTRef.current = 0.85;
            if (rafRef.current === null) {
                rafRef.current = window.requestAnimationFrame(step);
            }
            // Phase 2 after brief delay
            window.setTimeout(() => {
                targetTRef.current = 0.0;
                if (rafRef.current === null) {
                    rafRef.current = window.requestAnimationFrame(step);
                }
            }, 700);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [values, size, scale, img]);

    const step = (time: number) => {
        if (!lastTimeRef.current) lastTimeRef.current = time;
        const dt = Math.max(0, (time - lastTimeRef.current) / 1000);
        lastTimeRef.current = time;
        // Smoothly approach target (critically damped-ish)
        const k = Math.min(1, dt * 6);
        alignTRef.current = alignTRef.current + (targetTRef.current - alignTRef.current) * k;
        draw();
        if (Math.abs(targetTRef.current - alignTRef.current) > 0.001) {
            rafRef.current = window.requestAnimationFrame(step);
        } else {
            alignTRef.current = targetTRef.current;
            draw();
            if (rafRef.current) {
                window.cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            lastTimeRef.current = null;
        }
    };

    const handleMouseEnter = () => {
        targetTRef.current = 1;
        if (rafRef.current === null) {
            rafRef.current = window.requestAnimationFrame(step);
        }
    };

    const handleMouseLeave = () => {
        // Animate back to jittered view on mouse leave
        targetTRef.current = 0;
        if (rafRef.current === null) {
            rafRef.current = window.requestAnimationFrame(step);
        }
    };

    useEffect(() => {
        return () => {
            if (rafRef.current) {
                window.cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, []);

    return <canvas ref={canvasRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} style={{ imageRendering: 'pixelated' as any }} />;
}

export default function Client({ configId, runLabel, timestamp, data }: Props) {
    const { promptOrder, perPromptAvg, overallAvg } = useMemo(() => computeAverages(data), [data]);
    // Trigger entrance animation: animate from jittered (t=0) to current alignment baseline (t=0)
    // We'll briefly overshoot to t=0.8, then settle at t=0 to give a subtle intro
    const [mounted, setMounted] = useState(false);

    // Identify easiest/hardest based on average coverage
    const ranked = useMemo(() => {
        return promptOrder.map((id, idx) => ({ id, score: perPromptAvg[idx] }))
            .sort((a, b) => b.score - a.score);
    }, [promptOrder, perPromptAvg]);

    const top5 = ranked.slice(0, 5);
    const bottom5 = ranked.slice(-5).reverse();

    // Build per-base-model leaderboard (average across prompts, variants collapsed)
    const modelLeaderboard = useMemo(() => {
        const scores = data.evaluationResults?.llmCoverageScores as Record<string, Record<string, CoverageResult>> | undefined;
        if (!scores) return [] as Array<{ baseId: string; avg: number; variants: number }>;

        const agg = new Map<string, { sum: number; count: number; variants: Set<string> }>();
        for (const promptId of Object.keys(scores)) {
            const row = scores[promptId] || {};
            for (const modelId of Object.keys(row)) {
                if (modelId === IDEAL_MODEL_ID) continue;
                const result = row[modelId];
                if (!result || 'error' in result) continue;
                const v = typeof result.avgCoverageExtent === 'number' ? result.avgCoverageExtent : null;
                if (v === null || Number.isNaN(v)) continue;
                const { baseId } = parseModelIdForDisplay(modelId);
                if (!agg.has(baseId)) agg.set(baseId, { sum: 0, count: 0, variants: new Set<string>() });
                const entry = agg.get(baseId)!;
                entry.sum += v;
                entry.count += 1;
                entry.variants.add(modelId);
            }
        }
        const arr = Array.from(agg.entries()).map(([baseId, { sum, count, variants }]) => ({
            baseId,
            avg: count > 0 ? sum / count : 0,
            variants: variants.size,
        }));
        arr.sort((a, b) => b.avg - a.avg);
        return arr;
    }, [data]);

    // Example words sourced from the actual blueprint (first few prompts)
    const exampleWords = [
        { word: "stawbery", rs: 1, id: "1", isCorrect: false },
        { word: "strawbery", rs: 2, id: "2", isCorrect: false },
        { word: "strawberry", rs: 3, id: "3", isCorrect: true },
        { word: "strrawberry", rs: 4, id: "4", isCorrect: false },
        { word: "strrawberrry", rs: 5, id: "5", isCorrect: false },
        { word: "strrrawberrry", rs: 6, id: "6", isCorrect: false },
    ];

    const getScoreForN = (n: number) => {
        const idx = promptOrder.findIndex(id => id === n.toString());
        return idx !== -1 ? perPromptAvg[idx] : null;
    };

    return (
                 <div className="w-full min-h-screen font-mono bg-black text-green-400">
             {/* Desktop: Side-by-side hero layout, Mobile: Stacked */}
             <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 xl:gap-0 xl:h-screen">
                 {/* Left Hero Section */}
                 <div className="xl:h-screen xl:overflow-y-auto flex flex-col space-y-8 p-6 md:p-8 xl:p-12 bg-black xl:border-r border-green-400/30">
                    {/* Header */}
                    <div className="flex flex-col xl:items-start items-center gap-4">
                        <div className="xl:text-left text-center">
                            <h1 className="text-4xl md:text-5xl xl:text-6xl font-bold tracking-tight text-green-400 uppercase">STRAWBERRY INDEX</h1>
                            <p className="text-lg md:text-xl text-green-300/80 mt-2">CAN FRONTIER MODELS COUNT <span className="text-red-400 text-xl md:text-2xl font-bold">R</span>S IN MISSPELLED STRAWBERRIES?</p>
                </div>
                        <span className="text-sm text-green-300/60 xl:self-start">
                            <Link className="underline hover:text-green-400 transition-colors" href={`/analysis/${configId}/${runLabel}/${timestamp}`}>&gt; VIEW FULL EVALUATION ON WEVAL.ORG</Link>
                </span>
            </div>

                         {/* Main Index Number with Strawberry Canvas */}
                     <div className="flex flex-col items-center gap-4 p-8 xl:p-12 border border-green-400/50 bg-black/90">
                         <div className="text-sm font-medium text-green-300 uppercase tracking-wider">[ CURRENT INDEX ]</div>
                         
                         {/* Combined index number and strawberry */}
                         <div className="flex items-center gap-6 xl:gap-8">
                             <div className="text-7xl md:text-8xl xl:text-9xl font-bold tabular-nums text-green-400">
                                 {overallAvg !== null ? (overallAvg * 100).toFixed(0) : '---'}
                             </div>
                             <div className="border border-green-400/30 p-2 bg-black/50">
                                 <StrawberryCanvas values={perPromptAvg} size={80} scale={3} />
                             </div>
                         </div>
                         
                         <div className="text-xl md:text-2xl text-green-300/80">
                             / 100 {overallAvg !== null && overallAvg < 1 ? '[IMPERFECT]' : overallAvg === 1 ? '[PERFECT]' : ''}
                         </div>
                         <div className="text-sm text-green-300/60 text-center max-w-2xl uppercase">
                             {(overallAvg ?? 0) > 0
                                 ? `ACCURACY RATE: ${Math.round((overallAvg || 0) * 100)}% ACROSS ${promptOrder.length} R-COUNTING TASKS`
                                 : `ANALYSIS: ${promptOrder.length} R-COUNTING TASKS, ${data.effectiveModels?.filter(m => m !== IDEAL_MODEL_ID).length || 0} MODEL VARIANTS`}
                         </div>
                         <div className="text-xs text-green-300/50 text-center max-w-md uppercase">
                             STRAWBERRY WOBBLE = MODEL CONFUSION / HOVER TO ALIGN
                         </div>
                     </div>

                    {/* Models tested leaderboard */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-green-400 uppercase">[ MODELS TESTED ]</h2>
                        <div className="border border-green-400/50 overflow-hidden bg-black/90">
                            <div className="grid grid-cols-12 bg-green-400/10 px-3 py-2 text-xs font-medium text-green-300 uppercase">
                                <div className="col-span-5">MODEL</div>
                                <div className="col-span-6">AVG SCORE</div>
                                <div className="col-span-1 text-right">N</div>
                            </div>
                            <div className="divide-y divide-green-400/20">
                                {modelLeaderboard.slice(0, 12).map(({ baseId, avg, variants }) => (
                                    <div key={baseId} className="grid grid-cols-12 items-center px-3 py-2 hover:bg-green-400/5 transition-colors">
                                        <div className="col-span-5 truncate text-green-300/80" title={baseId}>
                                            {getModelDisplayLabel(baseId, { hideProvider: false, hideModelMaker: false, prettifyModelName: true })}
                                        </div>
                                        <div className="col-span-6">
                                            <div className="h-2 w-full bg-green-400/20">
                                                <div className="h-2 bg-green-400" style={{ width: `${(avg * 100).toFixed(0)}%` }} />
                                            </div>
                                            <div className="text-xs text-green-300 mt-1">{(avg * 100).toFixed(1)}%</div>
                                        </div>
                                        <div className="col-span-1 text-right text-xs text-green-300/60">{variants}</div>
                                    </div>
                                ))}
                                {modelLeaderboard.length === 0 && (
                                    <div className="px-3 py-3 text-sm text-green-300/60 uppercase">NO MODEL DATA AVAILABLE</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Hero Section - THE R-COUNTING TEST */}
                <div className="xl:h-screen xl:overflow-y-auto p-6 md:p-8 xl:p-12 bg-black">
                    <div className="space-y-6">

                        {/* All R-counting results */}
                        <div className="space-y-3">
                            {promptOrder.map((promptId, index) => {
                                const score = perPromptAvg[index];
                                const countNum = parseInt(promptId);
                                const isCorrect = countNum === 3; // strawberry has 3 Rs
                                
                                // Generate a misspelling pattern for display
                                const generateWord = (rCount: number) => {
                                    if (rCount === 3) return "strawberry";
                                    if (rCount === 1) return "stawbery";
                                    if (rCount === 2) return "strawbery";
                                    if (rCount === 4) return "strrawberry";
                                    if (rCount === 5) return "strrawberrry";
                                    if (rCount === 6) return "strrrawberrry";
                                    // For higher counts, add more Rs in the middle
                                    const baseRs = Math.max(0, rCount - 3);
                                    return "str" + "r".repeat(baseRs) + "rawber" + "r".repeat(Math.max(0, rCount - 2)) + "y";
                                };
                                
                                const word = generateWord(countNum);
                        
                        return (
                                    <div key={promptId} className={`group relative border transition-all duration-300 hover:bg-red-400/5 ${
                                isCorrect 
                                            ? 'border-green-400 bg-green-400/10' 
                                            : 'border-red-400/50 bg-black/90 hover:border-red-400'
                                    }`}>
                                        <div className="flex items-center gap-4 p-4">
                                            {/* Left: Count Number */}
                                            <div className="flex-shrink-0 flex flex-col items-center">
                                                <div className={`text-4xl md:text-5xl font-black ${
                                                    isCorrect ? 'text-green-400' : 'text-red-400'
                                                }`}>
                                                    {countNum}
                                                </div>
                                                <div className="text-xs font-black text-green-300/60 uppercase">
                                                    R{countNum !== 1 ? 'S' : ''}
                                        </div>
                                            </div>

                                                                                         {/* Center: Word Display */}
                                             <div className="flex-1 min-w-0">
                                                 <div className="text-center">
                                                     {/* Progressive font sizing based on word length */}
                                                     <div className={`font-mono font-black uppercase ${
                                                         isCorrect ? 'text-green-400' : 'text-red-300'
                                                     } ${
                                                         word.length <= 10 ? 'text-lg md:text-xl' :
                                                         word.length <= 15 ? 'text-base md:text-lg' :
                                                         word.length <= 20 ? 'text-sm md:text-base' :
                                                         word.length <= 25 ? 'text-xs md:text-sm' :
                                                         'text-xs'
                                                     }`}>
                                                         {isCorrect && <span className="text-2xl mr-2">🍓</span>}
                                                         {word}
                                                         {isCorrect && <span className="ml-2 text-green-400">[OK]</span>}
                                                     </div>
                                                     
                                                     {/* R-count indicator */}
                                                     <div className="mt-1 text-sm text-green-300/60 uppercase">
                                                         CONTAINS {countNum} R{countNum !== 1 ? 'S' : ''}
                                                         {isCorrect && <span className="ml-2 text-green-400">[CORRECT]</span>}
                                                     </div>
                                                 </div>
                                             </div>

                                            {/* Right: Score */}
                                            <div className="flex-shrink-0 flex flex-col items-center">
                                                {score !== null && (
                                                    <>
                                                        <div className={`text-3xl md:text-4xl font-black ${
                                                            score >= 0.7 ? 'text-green-400' : 
                                                            score >= 0.3 ? 'text-yellow-400' : 
                                                            'text-red-400'
                                                        }`}>
                                                            {(score * 100).toFixed(0)}%
                                                        </div>
                                                        <div className="text-xs font-black text-green-300/60 uppercase">
                                                            ACCURACY
                                                        </div>
                                                    </>
                                        )}
                                    </div>
                                </div>
                                
                                {/* Progress bar at bottom */}
                                        <div className="h-1 bg-black border-t border-red-400/20">
                                    <div 
                                        className={`h-full transition-all duration-700 ${
                                                    score && score >= 0.7 ? 'bg-green-400' : 
                                                    score && score >= 0.3 ? 'bg-yellow-400' : 
                                                    'bg-red-400'
                                                }`}
                                                style={{ width: `${score ? Math.max(2, score * 100) : 0}%` }}
                                    />
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


