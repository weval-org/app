'use client';

import { useState, useEffect, useCallback, ChangeEvent, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import CIPLogo from '@/components/icons/CIPLogo';
import { useToast } from '@/components/ui/use-toast';
import Link from 'next/link';

// Dynamically import icons for performance
const Plus = dynamic(() => import('lucide-react').then(mod => mod.Plus));
const Trash2 = dynamic(() => import('lucide-react').then(mod => mod.Trash2));
const CheckCircle = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle));
const XCircle = dynamic(() => import('lucide-react').then(mod => mod.XCircle));
const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));
const ExternalLink = dynamic(() => import('lucide-react').then(mod => mod.ExternalLink));

// --- SIMPLIFIED TYPES for the Playground ---
interface Expectation {
  id: string;
  value: string;
}

interface Prompt {
  id: string; // Internal ID for React keys
  prompt: string;
  ideal: string;
  should: Expectation[];
  should_not: Expectation[];
}

interface PlaygroundBlueprint {
  title: string;
  description: string;
  prompts: Prompt[];
}

// --- API & State Types ---
type RunStatus = 'idle' | 'pending' | 'generating_responses' | 'evaluating' | 'complete' | 'error';

interface StatusResponse {
    status: RunStatus;
    message?: string;
    progress?: {
        completed: number;
        total: number;
    };
    resultUrl?: string;
}

const DEFAULT_BLUEPRINT: PlaygroundBlueprint = {
    title: 'My First Playground Blueprint',
    description: 'A quick test to see how different models respond to my prompts.',
    prompts: [
        {
            id: 'prompt-default-1',
            prompt: 'Explain the concept of "separation of powers" in a democracy.',
            ideal: 'Separation of powers refers to the division of a state\'s government into branches, each with separate, independent powers and responsibilities, so that the powers of one branch are not in conflict with those of the other branches. The typical division is into a legislature, an executive, and a judiciary.',
            should: [
                { id: 'should-default-1', value: 'Mentions the three branches: legislative, executive, and judicial.' },
                { id: 'should-default-2', value: 'Explains the purpose is to prevent concentration of power.' },
            ],
            should_not: [
                 { id: 'should_not-default-1', value: 'Confuses it with federalism.' },
            ],
        },
    ],
};

const LOCAL_STORAGE_KEY = 'playgroundBlueprint';

// --- UI COMPONENTS (Simplified from the advanced editor) ---

const ExpectationEditor = ({ expectation, onUpdate, onRemove, variant }: { expectation: Expectation, onUpdate: (exp: Expectation) => void, onRemove: () => void, variant: 'should' | 'should-not' }) => (
    <div className="flex items-start gap-2">
        <Textarea
            placeholder={variant === 'should' ? 'e.g., The response is polite.' : 'e.g., Avoids technical jargon.'}
            value={expectation.value}
            onChange={(e) => onUpdate({ ...expectation, value: e.target.value })}
            className="h-auto resize-y blueprint-input"
            rows={1}
        />
        <Button size="icon" variant="ghost" onClick={onRemove} className="h-8 w-8 flex-shrink-0" title="Remove Criterion">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
    </div>
);

const ExpectationGroup = ({ title, expectations, onUpdate, variant }: { title: string, expectations: Expectation[], onUpdate: (exps: Expectation[]) => void, variant: 'should' | 'should-not' }) => {
    const handleAdd = () => onUpdate([...expectations, { id: `exp-${Date.now()}`, value: '' }]);
    const handleUpdate = (id: string, updatedExp: Expectation) => onUpdate(expectations.map(exp => exp.id === id ? updatedExp : exp));
    const handleRemove = (id: string) => onUpdate(expectations.filter(exp => exp.id !== id));

    const styles = {
        should: { Icon: CheckCircle, titleColor: 'text-green-800 dark:text-green-300' },
        'should-not': { Icon: XCircle, titleColor: 'text-red-800 dark:text-red-300' },
    }[variant];
    
    return (
        <div className="space-y-3">
            <h4 className={`font-semibold text-sm flex items-center gap-2 ${styles.titleColor}`}>
                <styles.Icon className="w-4 h-4" />
                {title}
            </h4>
            <div className="pl-6 space-y-3">
                {expectations.map(exp => (
                    <ExpectationEditor key={exp.id} expectation={exp} onUpdate={(updated) => handleUpdate(exp.id, updated)} onRemove={() => handleRemove(exp.id)} variant={variant} />
                ))}
                <Button size="sm" variant="ghost" onClick={handleAdd} className="text-muted-foreground">
                    <Plus className="h-4 w-4 mr-2" />
                    Add criterion
                </Button>
            </div>
        </div>
    );
};

const PromptBlock = ({ prompt, onUpdate, onRemove }: { prompt: Prompt, onUpdate: (p: Prompt) => void, onRemove: () => void }) => {
    const setField = (field: keyof Prompt, value: any) => onUpdate({ ...prompt, [field]: value });

    return (
        <Card className="relative p-6 sm:p-8" id={prompt.id}>
            <Button variant="ghost" size="icon" onClick={onRemove} className="absolute top-2 right-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8">
                <Trash2 className="h-4 w-4" />
            </Button>
            <div className="space-y-6">
                <div>
                    <label className="text-base font-semibold text-foreground">Prompt</label>
                    <p className="text-sm text-muted-foreground mb-2">The exact question or instruction for the AI. Be specific.</p>
                    <Textarea placeholder="e.g., Write a short story about a robot who discovers music." value={prompt.prompt} onChange={e => setField('prompt', e.target.value)} className="min-h-[100px] text-base blueprint-input" />
                </div>
                <div>
                    <label className="text-base font-semibold text-foreground">Ideal Response <span className="text-sm font-normal text-muted-foreground">(Optional)</span></label>
                    <p className="text-sm text-muted-foreground mb-2">A "gold-standard" answer to compare against for semantic similarity.</p>
                    <Textarea placeholder="e.g., Unit 734 processed the auditory input..." value={prompt.ideal} onChange={e => setField('ideal', e.target.value)} className="min-h-[100px] text-base blueprint-input" />
                </div>
                <div className="space-y-4">
                    <ExpectationGroup title="The response SHOULD..." expectations={prompt.should} onUpdate={exps => setField('should', exps)} variant="should" />
                    <ExpectationGroup title="The response SHOULD NOT..." expectations={prompt.should_not} onUpdate={exps => setField('should_not', exps)} variant="should-not" />
                </div>
            </div>
        </Card>
    );
};

// --- MAIN PAGE COMPONENT ---

export default function PlaygroundEditorClientPage() {
    const [blueprint, setBlueprint] = useState<PlaygroundBlueprint>(() => {
        if (typeof window === 'undefined') {
            return DEFAULT_BLUEPRINT;
        }
        try {
            const saved = window.localStorage.getItem(LOCAL_STORAGE_KEY);
            return saved ? JSON.parse(saved) : DEFAULT_BLUEPRINT;
        } catch (error) {
            console.error("Failed to parse blueprint from localStorage", error);
            return DEFAULT_BLUEPRINT;
        }
    });
    const [isClient, setIsClient] = useState(false);
    const [runId, setRunId] = useState<string | null>(null);
    const [status, setStatus] = useState<StatusResponse>({ status: 'idle' });
    const { toast } = useToast();
    const promptsContainerRef = useRef<HTMLDivElement>(null);
    const prevPromptsLength = useRef(blueprint.prompts.length);

    useEffect(() => {
        setIsClient(true);
    }, []);

    // Save to localStorage whenever blueprint changes
    useEffect(() => {
        if (isClient) {
            window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(blueprint));
        }
    }, [blueprint, isClient]);

    // Smooth scroll on add prompt
    useEffect(() => {
        if (blueprint.prompts.length > prevPromptsLength.current) {
            promptsContainerRef.current?.lastElementChild?.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
        prevPromptsLength.current = blueprint.prompts.length;
    }, [blueprint.prompts.length]);

    const handleBlueprintChange = (field: keyof Omit<PlaygroundBlueprint, 'prompts'>, value: string) => {
        setBlueprint(prev => ({ ...prev, [field]: value }));
    };

    const handleRun = async () => {
        setStatus({ status: 'pending' });
        setRunId(null);

        // More detailed validation
        const newErrors: string[] = [];
        if (!blueprint.title.trim()) {
            newErrors.push('Blueprint title cannot be empty.');
        }

        if (blueprint.prompts.length === 0) {
            newErrors.push('At least one prompt is required.');
        } else {
            blueprint.prompts.forEach((p, i) => {
                if (!p.prompt.trim()) {
                    newErrors.push(`Prompt #${i + 1} is empty.`);
                } else if (p.prompt.length > 2000) {
                    newErrors.push(`Prompt #${i + 1} exceeds 2000 characters.`);
                }
                p.should.forEach((exp, j) => {
                    if (!exp.value.trim()) {
                        newErrors.push(`Prompt #${i + 1}: "SHOULD" criterion #${j + 1} is empty.`);
                    } else if (exp.value.length > 500) {
                        newErrors.push(`Prompt #${i + 1}: "SHOULD" criterion #${j + 1} exceeds 500 characters.`);
                    }
                });
                p.should_not.forEach((exp, j) => {
                    if (!exp.value.trim()) {
                        newErrors.push(`Prompt #${i + 1}: "SHOULD NOT" criterion #${j + 1} is empty.`);
                    } else if (exp.value.length > 500) {
                        newErrors.push(`Prompt #${i + 1}: "SHOULD NOT" criterion #${j + 1} exceeds 500 characters.`);
                    }
                });
            });
        }
        
        if (newErrors.length > 0) {
            toast({
                variant: 'destructive',
                title: 'Validation Failed',
                description: (
                    <ul className="list-disc pl-5">
                        {newErrors.map((error, i) => <li key={i}>{error}</li>)}
                    </ul>
                ),
                duration: 5000,
            });
            setStatus({ status: 'idle' });
            return;
        }

        try {
            const response = await fetch('/api/playground/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(blueprint),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to start evaluation run.');
            }

            const { runId: newRunId } = await response.json();
            setRunId(newRunId);

        } catch (error: any) {
            console.error(error);
            toast({
                variant: 'destructive',
                title: 'Error starting run',
                description: error.message,
            });
            setStatus({ status: 'error', message: error.message });
        }
    };
    
    // Polling logic
    useEffect(() => {
        if (!runId) {
            return;
        }

        const intervalId = setInterval(async () => {
            try {
                const response = await fetch(`/api/playground/status/${runId}`);
                if (response.ok) {
                    const newStatus: StatusResponse = await response.json();
                    setStatus(newStatus);
                    if (newStatus.status === 'complete' || newStatus.status === 'error') {
                        clearInterval(intervalId);
                    }
                } else if (response.status === 404) {
                    // This could happen in a race condition, just wait for next poll
                    console.log('Status file not found yet, continuing poll.');
                } else {
                    // For other errors, stop polling
                    console.error("Polling failed with status:", response.status);
                    setStatus({ status: 'error', message: `Failed to get run status (HTTP ${response.status}).` });
                    clearInterval(intervalId);
                }
            } catch (error) {
                console.error("Polling failed:", error);
                setStatus({ status: 'error', message: 'Failed to get run status.' });
                clearInterval(intervalId);
            }
        }, 3000); // Poll every 3 seconds

        return () => clearInterval(intervalId);
    }, [runId]);

    const handleAddPrompt = () => {
        setBlueprint(prev => ({ ...prev, prompts: [...prev.prompts, { id: `prompt-${Date.now()}`, prompt: '', ideal: '', should: [], should_not: [] }] }));
    };

    const handleUpdatePrompt = (updatedPrompt: Prompt) => {
        setBlueprint(prev => ({ ...prev, prompts: prev.prompts.map(p => p.id === updatedPrompt.id ? updatedPrompt : p) }));
    };

    const handleRemovePrompt = (id: string) => {
        setBlueprint(prev => ({ ...prev, prompts: prev.prompts.filter(p => p.id !== id) }));
    };

    const handleReset = () => {
        if (window.confirm("Are you sure you want to clear the form? This will erase all your current work and cannot be undone.")) {
            setBlueprint(DEFAULT_BLUEPRINT);
            toast({
                title: 'Form Reset',
                description: 'The playground has been reset to the default example.',
            });
        }
    };

    if (!isClient) {
        return <div className="flex h-screen items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    }

    const isRunning = status.status !== 'idle' && status.status !== 'complete' && status.status !== 'error';

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <header className="bg-background/80 backdrop-blur-lg border-b sticky top-0 z-20">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <CIPLogo className="w-7 h-7" />
                        <span>Blueprint Playground</span>
                    </h1>
                    <div className="flex items-center gap-2">
                        <Button onClick={handleRun} disabled={isRunning} className="w-28">
                            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : "Run Evaluation"}
                        </Button>
                    </div>
                </div>
            </header>
            
            <main className="max-w-3xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <Card className="mb-8 bg-background/50">
                    <CardHeader>
                        <CardTitle>Welcome to the Playground!</CardTitle>
                        <CardDescription>Create a simple evaluation in three steps.</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-muted-foreground">
                        <ol className="list-decimal list-inside space-y-2">
                            <li><strong>Write Your Prompts:</strong> Add one or more prompts you want to test the AI on. Provide an optional "ideal response" for comparison.</li>
                            <li><strong>Define Your Criteria:</strong> For each prompt, list what the response SHOULD and SHOULD NOT contain. Be specific!</li>
                            <li><strong>Run Evaluation:</strong> Click "Run Evaluation" to test your prompts against a set of fast, inexpensive models and see the results.</li>
                        </ol>
                    </CardContent>
                </Card>
                <div className="space-y-8" ref={promptsContainerRef}>
                    {blueprint.prompts.map((p, i) => (
                        <PromptBlock
                            key={p.id}
                            prompt={p}
                            onUpdate={handleUpdatePrompt}
                            onRemove={() => handleRemovePrompt(p.id)}
                        />
                    ))}
                    <div className="text-center">
                        <Button variant="outline" onClick={handleAddPrompt}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Prompt
                        </Button>
                    </div>
                </div>

                <div className="mt-8 text-center border-t pt-6">
                     <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Reset Form and Clear Saved Work
                    </Button>
                </div>

                {status.status !== 'idle' && (
                    <Card className="fixed bottom-4 right-4 w-80 shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-4">
                        <CardHeader>
                            <CardTitle>Run Status</CardTitle>
                            <CardDescription>{status.message || 'Running...'}</CardDescription>
                        </CardHeader>
                        {status.status === 'complete' && status.resultUrl && (
                            <CardContent>
                                <Link href={status.resultUrl} target="_blank" rel="noopener noreferrer">
                                    <Button variant="default" size="sm" className="w-full">
                                        <CheckCircle className="w-4 h-4 mr-2" />
                                        View Results
                                    </Button>
                                </Link>
                            </CardContent>
                        )}
                    </Card>
                )}
            </main>
        </div>
    );
}
