'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, Loader2, Sparkles, Trophy } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';

interface GuessResult {
    modelId: string;
    similarity: number;
    rank: number;
    avgDistance: number;
    minDistance: number;
    maxDistance: number;
    samples: number;
}

interface ValidationError {
    type: 'length' | 'content';
    message: string;
}

interface ProgressState {
    message: string;
    progress: number;
    detail?: string;
}

type AnalysisMode = 'quick' | 'thorough';

export default function GuessClient() {
    const [text, setText] = useState('');
    const [mode, setMode] = useState<AnalysisMode>('quick');
    const [isValidating, setIsValidating] = useState(false);
    const [isGuessing, setIsGuessing] = useState(false);
    const [error, setError] = useState<ValidationError | null>(null);
    const [results, setResults] = useState<GuessResult[] | null>(null);
    const [progressState, setProgressState] = useState<ProgressState | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setResults(null);

        // Client-side length validation
        if (text.length < 300) {
            setError({ type: 'length', message: 'Text must be at least 300 characters long.' });
            return;
        }
        if (text.length > 10000) {
            setError({ type: 'length', message: 'Text must be less than 10,000 characters long.' });
            return;
        }

        // Step 1: Validate content
        setIsValidating(true);
        try {
            const validateRes = await fetch('/api/guess/validate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });

            const validateData = await validateRes.json();

            if (!validateRes.ok) {
                setError({ type: 'content', message: validateData.error || 'Validation failed' });
                setIsValidating(false);
                return;
            }

            if (!validateData.valid) {
                setError({
                    type: 'content',
                    message: validateData.reason || 'Text did not pass validation',
                });
                setIsValidating(false);
                return;
            }

            // Step 2: Run the guessor with streaming progress
            setIsValidating(false);
            setIsGuessing(true);
            setProgressState({ message: 'Preparing analysis...', progress: 0 });

            const response = await fetch('/api/guess/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, mode }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                setError({ type: 'content', message: errorData.error || 'Guessing failed' });
                setIsGuessing(false);
                setProgressState(null);
                return;
            }

            // Handle Server-Sent Events
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
                setError({ type: 'content', message: 'Failed to read response stream' });
                setIsGuessing(false);
                setProgressState(null);
                return;
            }

            try {
                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const jsonStr = line.slice(6);
                                const data = JSON.parse(jsonStr);

                                console.log('[Guess][Client] Received SSE event:', data.type, data);

                                if (data.type === 'error') {
                                    console.error('[Guess][Client] Error from server:', data.error);
                                    setError({ type: 'content', message: data.error });
                                    setIsGuessing(false);
                                    setProgressState(null);
                                    return;
                                }

                                if (data.type === 'complete') {
                                    console.log('[Guess][Client] Received complete event with results:', data.results?.length);
                                    if (data.results && Array.isArray(data.results)) {
                                        console.log('[Guess][Client] Setting results:', data.results);
                                        setResults(data.results);
                                        setIsGuessing(false);
                                        setProgressState(null);
                                    } else {
                                        console.error('[Guess][Client] Complete event missing results:', data);
                                        setError({ type: 'content', message: 'No results received from analysis' });
                                        setIsGuessing(false);
                                        setProgressState(null);
                                    }
                                    return;
                                }

                                // Update progress
                                setProgressState({
                                    message: data.message,
                                    progress: data.progress || 0,
                                    detail: data.detail,
                                });
                            } catch (parseError: any) {
                                console.error('[Guess][Client] Failed to parse SSE line:', line, parseError);
                                // Continue to next line - might be incomplete JSON
                            }
                        }
                    }
                }

                // If we exit the loop without getting complete, something went wrong
                console.error('[Guess][Client] Stream ended without complete event');
                setError({ type: 'content', message: 'Stream ended unexpectedly' });
                setIsGuessing(false);
                setProgressState(null);
            } catch (streamError: any) {
                console.error('[Guess][Client] Stream error:', streamError);
                setError({ type: 'content', message: streamError.message || 'Stream processing failed' });
                setIsGuessing(false);
                setProgressState(null);
            }
        } catch (err: any) {
            setError({ type: 'content', message: err.message || 'An error occurred' });
            setIsValidating(false);
            setIsGuessing(false);
        }
    };

    const charCount = text.length;
    const charCountColor =
        charCount < 300 ? 'text-red-500' :
        charCount > 10000 ? 'text-red-500' :
        'text-green-600';

    return (
        <div className="container mx-auto px-4 py-12 max-w-4xl">
            <div className="text-center mb-8">
                <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                    Guess the Model
                </h1>
                <p className="text-slate-600 dark:text-slate-400 text-lg mb-2">
                    Paste text written by an AI and we'll analyze its writing style to identify which model likely created it.
                </p>
            </div>

            <Card className="p-6 mb-6">
                <form onSubmit={handleSubmit}>
                    {/* Mode selector */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium mb-3">Analysis Mode</label>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setMode('quick')}
                                disabled={isValidating || isGuessing}
                                className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                                    mode === 'quick'
                                        ? 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100'
                                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}
                            >
                                <div className="font-semibold mb-1">⚡ Quick</div>
                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                    2 models • ~3-5 seconds
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('thorough')}
                                disabled={isValidating || isGuessing}
                                className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                                    mode === 'thorough'
                                        ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-100'
                                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                }`}
                            >
                                <div className="font-semibold mb-1">🎯 Thorough</div>
                                <div className="text-xs text-slate-600 dark:text-slate-400">
                                    9 models • ~8-10 seconds
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="mb-4">
                        <label htmlFor="text-input" className="block text-sm font-medium mb-2">
                            Paste LLM-generated text here
                        </label>
                        <Textarea
                            id="text-input"
                            placeholder="Enter at least 300 characters of text..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            className="min-h-[300px] font-mono text-sm"
                            disabled={isValidating || isGuessing}
                        />
                        <div className="flex justify-between items-center mt-2">
                            <span className={`text-sm ${charCountColor}`}>
                                {charCount} / 10,000 characters {charCount < 300 && `(${300 - charCount} minimum needed)`}
                            </span>
                        </div>
                    </div>

                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error.message}</AlertDescription>
                        </Alert>
                    )}

                    <Button
                        type="submit"
                        disabled={isValidating || isGuessing || charCount < 300 || charCount > 10000}
                        className="w-full"
                        size="lg"
                    >
                        {isValidating && (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Validating text...
                            </>
                        )}
                        {isGuessing && (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Analyzing patterns...
                            </>
                        )}
                        {!isValidating && !isGuessing && (
                            <>
                                <Sparkles className="mr-2 h-4 w-4" />
                                Guess the Model
                            </>
                        )}
                    </Button>
                </form>

                {progressState && (
                    <div className="mt-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{progressState.message}</span>
                            <span className="text-slate-500">{progressState.progress}%</span>
                        </div>
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 ease-out"
                                style={{ width: `${progressState.progress}%` }}
                            />
                        </div>
                        {progressState.detail && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                                {progressState.detail}
                            </p>
                        )}
                    </div>
                )}
            </Card>

            {results && results.length > 0 && (
                <Card className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Trophy className="h-6 w-6 text-yellow-500" />
                        <h2 className="text-2xl font-semibold">Results</h2>
                    </div>

                    {(() => {
                        const topResult = results[0];
                        const secondResult = results[1];
                        const diff = topResult && secondResult ? (topResult.similarity - secondResult.similarity) * 100 : 0;
                        const isConfident = diff > 5; // More than 5% difference

                        return (
                            <div className="mb-6">
                                {isConfident ? (
                                    <p className="text-slate-600 dark:text-slate-400">
                                        Based on writing style analysis, this text most closely matches <span className="font-semibold text-slate-900 dark:text-slate-100">{getModelDisplayLabel(topResult.modelId, { hideProvider: false, prettifyModelName: true })}</span>.
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        <p className="text-slate-600 dark:text-slate-400">
                                            The top matches are very close in similarity. This text could have been written by several models with similar writing styles.
                                        </p>
                                        <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4" />
                                            Low confidence - multiple models have similar patterns
                                        </p>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                        Ranked by stylistic similarity:
                    </p>
                    <div className="space-y-3">
                        {results.slice(0, 10).map((result, idx) => {
                            const isTopThree = idx < 3;
                            const gradientClass =
                                idx === 0 ? 'from-yellow-500 to-orange-500' :
                                idx === 1 ? 'from-slate-400 to-slate-500' :
                                idx === 2 ? 'from-orange-600 to-orange-700' :
                                'from-purple-500 to-blue-500';

                            // Calculate confidence level
                            const topSimilarity = results[0].similarity;
                            const relativeDiff = ((topSimilarity - result.similarity) / topSimilarity) * 100;
                            let confidenceBadge = null;
                            if (idx === 0) {
                                const diffToSecond = (results[0].similarity - results[1].similarity) * 100;
                                if (diffToSecond > 5) {
                                    confidenceBadge = <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">High confidence</span>;
                                } else if (diffToSecond > 2) {
                                    confidenceBadge = <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">Moderate confidence</span>;
                                } else {
                                    confidenceBadge = <span className="text-xs bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full">Low confidence</span>;
                                }
                            }

                            return (
                                <div
                                    key={result.modelId}
                                    className={`flex items-center justify-between p-4 rounded-lg border ${
                                        isTopThree
                                            ? 'bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 border-slate-300 dark:border-slate-600'
                                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    <div className="flex items-center gap-4 flex-1">
                                        <div className={`flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br ${gradientClass} text-white font-bold text-sm`}>
                                            #{result.rank}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="font-semibold text-base">
                                                    {getModelDisplayLabel(result.modelId, { hideProvider: false, prettifyModelName: true })}
                                                </div>
                                                {confidenceBadge}
                                            </div>
                                            <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                                                <span className="font-medium">{(result.similarity * 100).toFixed(1)}%</span>
                                                <span className="hidden sm:inline">Range: {(result.minDistance * 100).toFixed(1)}–{(result.maxDistance * 100).toFixed(1)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right ml-4">
                                        <div className="h-2 w-24 sm:w-32 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full bg-gradient-to-r ${gradientClass}`}
                                                style={{ width: `${result.similarity * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                        <details className="text-sm">
                            <summary className="cursor-pointer text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-medium">
                                How does this work?
                            </summary>
                            <div className="mt-3 space-y-2 text-slate-600 dark:text-slate-400">
                                <p>
                                    We analyze your text by comparing it against writing samples from different AI models.
                                    Each model is tested with multiple variations to capture its typical writing patterns.
                                </p>
                                <p>
                                    The similarity score indicates how closely your text matches each model's characteristic style.
                                    Higher percentages suggest stronger stylistic alignment.
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-500">
                                    Note: Similar scores (within 5%) indicate that multiple models could have written the text,
                                    or that the text doesn't have strong distinguishing features.
                                </p>
                            </div>
                        </details>
                    </div>
                </Card>
            )}
        </div>
    );
}
