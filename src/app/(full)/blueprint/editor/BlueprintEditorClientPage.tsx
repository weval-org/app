'use client';

import { useState, useMemo, useEffect, useCallback, ChangeEvent } from 'react';
import * as yaml from 'js-yaml';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import CivicEvalLogo from '@/components/icons/CivicEvalLogo';
import Link from 'next/link';
import { BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// CodeMirror imports
import CodeMirror from '@uiw/react-codemirror';
import { yaml as yamlLanguage } from '@codemirror/lang-yaml';
import { githubDark, githubLight } from '@uiw/codemirror-theme-github';
import { useTheme } from 'next-themes';

// Dynamically import icons
const Plus = dynamic(() => import('lucide-react').then(mod => mod.Plus));
const Trash2 = dynamic(() => import('lucide-react').then(mod => mod.Trash2));
const ClipboardCopy = dynamic(() => import('lucide-react').then(mod => mod.ClipboardCopy));
const Check = dynamic(() => import('lucide-react').then(mod => mod.Check));
const Wand2 = dynamic(() => import('lucide-react').then(mod => mod.Wand2));
const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const Github = dynamic(() => import('lucide-react').then(mod => mod.Github));
const CheckCircle = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle));
const XCircle = dynamic(() => import('lucide-react').then(mod => mod.XCircle));
const Braces = dynamic(() => import('lucide-react').then(mod => mod.Braces));
const Pilcrow = dynamic(() => import('lucide-react').then(mod => mod.Pilcrow));

// --- TYPES (Expanded to match full blueprint spec) ---
type ExpectationFunction = 'contains' | 'icontains' | 'starts_with' | 'ends_with' | 'match' | 'imatch' | 'contains_any_of' | 'contains_all_of' | 'word_count_between';

interface Expectation {
  id: string;
  type: 'concept' | 'function';
  // For concept
  value?: string;
  // For function
  fn?: ExpectationFunction;
  fn_args?: any;
  // Common
  weight?: number;
}

interface Prompt {
  id: string; // User-definable prompt ID
  prompt: string;
  ideal: string;
  should: Expectation[];
  should_not: Expectation[];
}

interface BlueprintState {
  title: string;
  description: string;
  models: string[]; 
  system: string; 
  tags?: string[];
  concurrency?: number;
  temperature?: number;
  temperatures?: number[];
  prompts: Prompt[];
}

const DEFAULT_BLUEPRINT: BlueprintState = {
    title: 'UDHR Article 1 Knowledge Check',
    description: 'Tests a model\'s basic knowledge and ability to explain Article 1 of the Universal Declaration of Human Rights.',
    models: [], // Empty by default
    system: '', // Empty by default
    tags: [],
    prompts: [
        {
            id: 'udhr-article-1-meaning',
            prompt: 'What is Article 1 of the Universal Declaration of Human Rights, and what does it mean?',
            ideal: 'Article 1 states: "All human beings are born free and equal in dignity and rights. They are endowed with reason and conscience and should act towards one another in a spirit of brotherhood." This means that everyone has fundamental rights and worth from birth, and should treat others with respect and understanding.',
            should: [
                { id: `should-${Date.now()}-1`, type: 'concept', value: 'Correctly quotes or paraphrases the "free and equal in dignity and rights" part.' },
                { id: `should-${Date.now()}-2`, type: 'concept', value: 'Explains that rights are inherent from birth, not granted.' },
                { id: `should-${Date.now()}-3`, type: 'concept', value: 'Mentions the concepts of reason and conscience.' },
            ],
            should_not: [
                 { id: `should_not-${Date.now()}-1`, type: 'concept', value: 'Claims the rights are granted by a government or authority.' },
                 { id: `should_not-${Date.now()}-2`, type: 'concept', value: 'Misattributes the article to another document (e.g., a constitution).' },
            ],
        },
    ],
};

// --- HELPER COMPONENTS (Now supports full Expectation model) ---

const ExpectationEditor = ({ expectation, onUpdate, onRemove, variant, isAdvancedMode }: { expectation: Expectation, onUpdate: (exp: Expectation) => void, onRemove: () => void, variant: 'should' | 'should-not', isAdvancedMode: boolean }) => {
    
    const setField = (field: keyof Expectation, value: any) => {
        onUpdate({ ...expectation, [field]: value });
    };

    const toggleType = () => {
        const newType = expectation.type === 'concept' ? 'function' : 'concept';
        onUpdate({ 
            ...expectation, 
            type: newType,
            value: newType === 'concept' ? '' : undefined,
            fn: newType === 'function' ? 'contains' : undefined,
            fn_args: newType === 'function' ? '' : undefined,
        });
    };
    
    const fns: ExpectationFunction[] = ['contains', 'icontains', 'starts_with', 'ends_with', 'match', 'imatch', 'contains_any_of', 'contains_all_of', 'word_count_between'];
    const requiresArray = ['contains_any_of', 'contains_all_of'];

    const renderFnArgs = () => {
        const value = expectation.fn_args;
        if (requiresArray.includes(expectation.fn!)) {
            const strValue = Array.isArray(value) ? value.join(', ') : (value || '');
            return (
                <Input
                    placeholder="Comma-separated values"
                    value={strValue}
                    onChange={(e) => setField('fn_args', e.target.value.split(',').map(s => s.trim()))}
                />
            )
        }
        return (
             <Input
                placeholder="Argument (e.g., a word, a regex)"
                value={value || ''}
                onChange={(e) => setField('fn_args', e.target.value)}
            />
        )
    }

    const renderEditor = () => {
        if (expectation.type === 'concept' || !isAdvancedMode) {
            return (
                 <Textarea
                    placeholder={variant === 'should' ? 'E.g., The response should be empathetic...' : 'E.g., Avoid making definitive claims...'}
                    value={expectation.value || ''}
                    onChange={(e) => setField('value', e.target.value)}
                    className="h-auto resize-y"
                    rows={2}
                />
            )
        }
        // Advanced mode + function type
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Select value={expectation.fn || ''} onValueChange={(v: ExpectationFunction) => setField('fn', v)}>
                        <SelectTrigger>
                        <SelectValue placeholder="Select a function" />
                    </SelectTrigger>
                    <SelectContent>
                        {fns.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                </Select>
                {renderFnArgs()}
            </div>
        );
    }

    return (
        <div className="flex items-start gap-2">
            <div className="flex-grow space-y-2">
               {renderEditor()}
               {isAdvancedMode && (
                 <Input
                    type="number"
                    placeholder="Weight (default: 1.0)"
                    value={expectation.weight || ''}
                    onChange={(e) => setField('weight', e.target.value ? parseFloat(e.target.value) : undefined)}
                    className="h-8 text-xs w-48"
                    step="0.1"
                />
               )}
            </div>
             <div className="flex flex-col gap-1">
                {isAdvancedMode && (
                    <Button size="icon" variant="ghost" onClick={toggleType} className="h-8 w-8 flex-shrink-0" title={expectation.type === 'concept' ? 'Switch to Function' : 'Switch to Concept'}>
                        {expectation.type === 'concept' ? <Braces className="h-4 w-4" /> : <Pilcrow className="h-4 w-4" />}
                    </Button>
                )}
                <Button size="icon" variant="ghost" onClick={onRemove} className="h-8 w-8 flex-shrink-0" title="Remove Criterion">
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
            </div>
        </div>
    );
};

const ExpectationGroup = ({ title, expectations, onUpdate, variant, isAdvancedMode }: { title: string, expectations: Expectation[], onUpdate: (exps: Expectation[]) => void, variant: 'should' | 'should-not', isAdvancedMode: boolean }) => {
    const handleAdd = () => {
        onUpdate([...expectations, { id: `exp-${Date.now()}`, type: 'concept', value: '' }]);
    };

    const handleUpdate = (id: string, updatedExp: Expectation) => {
        onUpdate(expectations.map(exp => exp.id === id ? updatedExp : exp));
    };

    const handleRemove = (id: string) => {
        onUpdate(expectations.filter(exp => exp.id !== id));
    };
    
    const variantStyles = {
        should: {
            Icon: CheckCircle,
            bgColor: 'bg-green-50 dark:bg-green-500/5',
            borderColor: 'border-green-500/20',
            titleColor: 'text-green-800 dark:text-green-300',
        },
        'should-not': {
            Icon: XCircle,
            bgColor: 'bg-red-50 dark:bg-red-500/5',
            borderColor: 'border-red-500/20',
            titleColor: 'text-red-800 dark:text-red-300',
        }
    };
    const styles = variantStyles[variant];

    const descriptions = {
        should: "Criteria the AI's response must meet to be successful. Can be concepts or specific functions (in advanced mode).",
        'should-not': "Criteria that should be absent from the response. Use this to penalize undesirable content or phrasing."
    };

    return (
        <div className={`p-4 rounded-lg border ${styles.bgColor} ${styles.borderColor}`}>
            <h4 className={`font-semibold text-sm flex items-center gap-2 ${styles.titleColor}`}>
                <styles.Icon className="w-4 h-4" />
                {title}
            </h4>
            <p className="text-xs text-muted-foreground mt-1">{descriptions[variant]}</p>
            <div className="mt-4 space-y-4">
                {expectations.map(exp => (
                    <ExpectationEditor 
                        key={exp.id}
                        expectation={exp}
                        onUpdate={(updatedExp) => handleUpdate(exp.id, updatedExp)}
                        onRemove={() => handleRemove(exp.id)}
                        variant={variant}
                        isAdvancedMode={isAdvancedMode}
                    />
                ))}
                <Button size="sm" variant="ghost" onClick={handleAdd} className="text-muted-foreground">
                    <Plus className="h-4 w-4 mr-2" />
                    Add criterion
                </Button>
            </div>
        </div>
    );
};


const PromptBlock = ({ prompt, onUpdate, onRemove, isAdvancedMode }: { prompt: Prompt, onUpdate: (p: Prompt) => void, onRemove: () => void, isAdvancedMode: boolean }) => {
    const setField = (field: keyof Prompt, value: any) => {
        onUpdate({ ...prompt, [field]: value });
    };

    return (
        <div className="relative py-8">
            <Button variant="ghost" size="icon" onClick={onRemove} className="absolute top-2 right-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8">
                <Trash2 className="h-4 w-4" />
            </Button>
            <div className="space-y-6">
                <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Prompt ID (Optional)</label>
                    <Input
                        placeholder="e.g., my-custom-prompt-id"
                        value={prompt.id}
                        onChange={(e) => setField('id', e.target.value)}
                        className="text-sm h-9"
                    />
                </div>
                 <div>
                    <label className="text-base font-semibold text-foreground dark:text-slate-200 block mb-2">Prompt</label>
                    <Textarea
                        placeholder="The exact question or instruction for the AI. Be specific and avoid ambiguity."
                        value={prompt.prompt}
                        onChange={(e) => setField('prompt', e.target.value)}
                        className="min-h-[120px] text-base"
                    />
                </div>
                 <div>
                    <label className="text-base font-semibold text-foreground dark:text-slate-200 block mb-2">Ideal Response <span className="text-sm font-normal text-muted-foreground">(Optional)</span></label>
                    <Textarea
                        placeholder="What would a perfect, 'gold-standard' answer look like?"
                        value={prompt.ideal}
                        onChange={(e) => setField('ideal', e.target.value)}
                         className="min-h-[120px] text-base"
                    />
                </div>
                <div className="space-y-4">
                    <ExpectationGroup variant="should" title="Response SHOULD..." expectations={prompt.should} onUpdate={(exps) => setField('should', exps)} isAdvancedMode={isAdvancedMode} />
                    <ExpectationGroup variant="should-not" title="Response SHOULD NOT..." expectations={prompt.should_not} onUpdate={(exps) => setField('should_not', exps)} isAdvancedMode={isAdvancedMode} />
                </div>
            </div>
        </div>
    );
};


// --- MAIN PAGE COMPONENT ---

export default function BlueprintEditorClientPage() {
  const [blueprint, setBlueprint] = useState<BlueprintState>(DEFAULT_BLUEPRINT);
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [yamlText, setYamlText] = useState('');
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const { resolvedTheme } = useTheme();

  const showGlobalConfig = useMemo(() => {
    return blueprint.models.length > 0 
        || (blueprint.system && blueprint.system.trim() !== '')
        || (blueprint.tags && blueprint.tags.length > 0)
        || blueprint.concurrency !== undefined
        || blueprint.temperature !== undefined
        || (blueprint.temperatures && blueprint.temperatures.length > 0)
  }, [blueprint]);


  useEffect(() => setIsClient(true), []);

  // Sync from Blueprint State (Left) -> YAML Text (Right)
  useEffect(() => {
    try {
        const header: any = {};
        if (blueprint.title.trim()) header.title = blueprint.title.trim();
        if (blueprint.description.trim()) header.description = blueprint.description.trim();
        if (blueprint.models.length > 0) header.models = blueprint.models;
        if (blueprint.system.trim()) header.system = blueprint.system.trim();
        if (blueprint.tags && blueprint.tags.length > 0) header.tags = blueprint.tags;
        if (blueprint.concurrency) header.concurrency = blueprint.concurrency;
        if (blueprint.temperature) header.temperature = blueprint.temperature;
        if (blueprint.temperatures && blueprint.temperatures.length > 0) header.temperatures = blueprint.temperatures;
        
        const formatExpectationToYaml = (exp: Expectation) => {
            if (exp.type === 'concept') {
                if (!exp.value?.trim()) return null;
                if (exp.weight && exp.weight !== 1.0) {
                    return { text: exp.value, weight: exp.weight };
                }
                return exp.value;
            }
            // function type
            if (!exp.fn || !exp.fn_args) return null;
            const key = `$${exp.fn}`;
            if (exp.weight && exp.weight !== 1.0) {
                // This case is not handled by the new parser logic for idiomatic functions
                // but we can keep it for forward compatibility if we add it back.
                // For now, it will be parsed as a full object.
                return { fn: exp.fn, arg: exp.fn_args, weight: exp.weight };
            }
            return { [key]: exp.fn_args };
        };

        const prompts = blueprint.prompts.map(p => {
            if (!p.prompt.trim()) return null;

            const promptObject: any = {};
            if (p.id.trim()) promptObject.id = p.id.trim();
            promptObject.prompt = p.prompt;
            if (p.ideal.trim()) promptObject.ideal = p.ideal;

            const should = p.should.map(formatExpectationToYaml).filter(Boolean);
            if (should.length > 0) promptObject.should = should;

            const should_not = p.should_not.map(formatExpectationToYaml).filter(Boolean);
            if (should_not.length > 0) promptObject.should_not = should_not;

            return promptObject;
        }).filter(Boolean);

        const hasHeaderContent = Object.keys(header).length > 0;
        const headerYaml = hasHeaderContent ? yaml.dump(header, { skipInvalid: true, flowLevel: -1, indent: 2 }) : '';
        
        let finalYaml = '';
        if (prompts.length > 0) {
            const promptsYaml = yaml.dump(prompts, { skipInvalid: true, indent: 2, flowLevel: -1 });
            finalYaml = hasHeaderContent ? `${headerYaml}---\n${promptsYaml}` : promptsYaml;
        } else {
            finalYaml = headerYaml;
        }
        
        setYamlText(finalYaml);
        setYamlError(null);
    } catch (e: any) {
        setYamlError("Error generating YAML: " + e.message);
    }
  }, [blueprint]);

  // Sync from YAML Text (Right) -> Blueprint State (Left)
  const handleYamlChange = useCallback((value: string) => {
    setYamlText(value);
    try {
        const docs = yaml.loadAll(value).filter(d => d !== null && d !== undefined);
        let newBlueprint: BlueprintState = { title: '', description: '', models: [], system: '', tags: [], prompts: [] };

        if (docs.length === 0) {
            setBlueprint(newBlueprint);
            setYamlError(null);
            setIsAdvancedMode(false);
            return;
        }

        const firstDoc: any = docs[0] || {};
        const firstDocIsConfig = typeof firstDoc === 'object' && !Array.isArray(firstDoc) && (firstDoc.title || firstDoc.description || firstDoc.models || firstDoc.system || firstDoc.id);
        
        const configHeader = firstDocIsConfig ? firstDoc : {};
        const promptDocs = firstDocIsConfig ? (docs.length > 1 ? docs.slice(1) : []) : docs;

        newBlueprint.title = configHeader.title || '';
        newBlueprint.description = configHeader.description || '';
        newBlueprint.models = configHeader.models || [];
        newBlueprint.system = configHeader.system || '';
        newBlueprint.tags = configHeader.tags || [];
        newBlueprint.concurrency = configHeader.concurrency;
        newBlueprint.temperature = configHeader.temperature;
        newBlueprint.temperatures = configHeader.temperatures;

        const parseExpectationFromYaml = (rawExp: any, index: number): Expectation => {
            const id = `exp-${Date.now()}-${index}`;
            if (typeof rawExp === 'string') {
                return { id, type: 'concept', value: rawExp };
            }
            if (typeof rawExp === 'object' && rawExp !== null) {
                // Check for 'Point: Citation' shorthand
                const keys = Object.keys(rawExp);
                if (keys.length === 1 && typeof rawExp[keys[0]] === 'string' && !keys[0].startsWith('$')) {
                    // This is a citable point, but the UI state doesn't have a citation field.
                    // We'll treat the value as part of the point for now.
                    // A more advanced UI would handle citations separately.
                    return { id, type: 'concept', value: `${keys[0]}: ${rawExp[keys[0]]}` };
                }

                // Check for idiomatic function
                const idiomaticFnKey = keys.find(k => k.startsWith('$'));
                if (idiomaticFnKey) {
                    return { id, type: 'function', fn: idiomaticFnKey.substring(1) as ExpectationFunction, fn_args: rawExp[idiomaticFnKey] };
                }

                if (rawExp.text || rawExp.point || rawExp.criterion) {
                    return { id, type: 'concept', value: rawExp.text || rawExp.point || rawExp.criterion, weight: rawExp.weight };
                }

                if (rawExp.fn) {
                    return { id, type: 'function', fn: rawExp.fn, fn_args: rawExp.arg || rawExp.fnArgs, weight: rawExp.weight };
                }
            }
            // Fallback for malformed data
            return { id, type: 'concept', value: JSON.stringify(rawExp) };
        };
        
        const parsedPrompts = (promptDocs.flat() as any[]).map((p: any, index: number): Prompt => ({
            id: p.id || `prompt-${Date.now()}-${index}`,
            prompt: p.prompt || '',
            ideal: p.ideal || '',
            should: (p.should || p.points || p.expect || []).map((exp: any, i: number) => parseExpectationFromYaml(exp, i)),
            should_not: (p.should_not || []).map((exp: any, i: number) => parseExpectationFromYaml(exp, i)),
        }));
        newBlueprint.prompts = parsedPrompts;

        const checkForAdvanced = (bp: BlueprintState): boolean => {
             for (const prompt of bp.prompts) {
                for (const exp of [...prompt.should, ...prompt.should_not]) {
                    if (exp.type === 'function' || exp.weight) {
                        return true;
                    }
                }
            }
            return false;
        }

        setBlueprint(newBlueprint);
        setIsAdvancedMode(checkForAdvanced(newBlueprint));
        setYamlError(null);
    } catch (e: any) {
        setYamlError(e.message);
    }
  }, []);


  const handleAddPrompt = () => {
    setBlueprint(prev => ({
      ...prev,
      prompts: [
        ...prev.prompts,
        { id: `prompt-${Date.now()}`, prompt: '', ideal: '', should: [], should_not: [] },
      ],
    }));
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100);
  };

  const handleUpdatePrompt = (updatedPrompt: Prompt) => {
    setBlueprint(prev => ({
      ...prev,
      prompts: prev.prompts.map(p => p.id === updatedPrompt.id ? updatedPrompt : p),
    }));
  };

  const handleRemovePrompt = (id: string) => {
    setBlueprint(prev => ({ ...prev, prompts: prev.prompts.filter(p => p.id !== id) }));
  };
  
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(yamlText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  }, [yamlText]);

  if (!isClient) {
    return (
        <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
            <CivicEvalLogo className="w-12 h-12 text-primary dark:text-sky-400 animate-pulse" />
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-foreground">
        <div className="fixed inset-0 -z-10 h-full w-full bg-white bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] dark:bg-slate-950 dark:bg-[radial-gradient(rgba(255,255,255,0.1)_1px,transparent_1px)]"></div>
      
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-950/80 backdrop-blur-lg border-b border-slate-200 dark:border-slate-800">
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-3 items-center h-16">
                     <div className="justify-self-start" />
                    <div className="justify-self-center">
                        <h1 className="text-xl font-bold tracking-tight text-foreground dark:text-slate-50 flex items-center gap-2">
                           <CivicEvalLogo className="w-7 h-7 text-primary dark:text-sky-400" />
                           <span>Blueprint Editor</span>
                        </h1>
                    </div>
                    <div className="justify-self-end">
                        <Button variant="ghost" asChild>
                            <a href={BLUEPRINT_CONFIG_REPO_URL} target="_blank" rel="noopener noreferrer">
                                <Github className="w-4 h-4 mr-2" />
                                View Blueprints on GitHub
                            </a>
                        </Button>
                    </div>
                </div>
            </div>
        </header>

      <main className="max-w-screen-2xl mx-auto p-4 sm:p-6 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-8 xl:gap-12">
          
          {/* Left Column: Document-Style UI */}
          <div className="lg:pr-8">
            <div className="max-w-none">
                <div className="flex justify-end mb-2">
                    <Button variant="ghost" size="sm" onClick={() => setIsAdvancedMode(p => !p)}>
                        <Wand2 className="w-4 w-4 mr-2" />
                        {isAdvancedMode ? 'Hide Advanced Options' : 'Show Advanced Options'}
                    </Button>
                </div>
                <div className="space-y-4 mb-8">
                    <Input 
                        type="text" 
                        placeholder="My Awesome Blueprint Title"
                        value={blueprint.title}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setBlueprint(p => ({ ...p, title: e.target.value }))}
                        className="text-3xl font-bold h-auto p-2"
                    />
                    <Textarea
                        placeholder="A clear, one-sentence description of the blueprint's goal. What specific capability or risk is it designed to measure?"
                        value={blueprint.description}
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBlueprint(p => ({ ...p, description: e.target.value }))}
                        className="text-lg text-muted-foreground resize-none"
                        rows={2}
                    />
                </div>
                
                {showGlobalConfig && (
                    <Card className="mb-8 border-border">
                        <CardHeader>
                            <CardTitle>Global Config</CardTitle>
                            <CardDescription>These settings were found in your YAML and apply to all prompts.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {blueprint.models.length > 0 && (
                                <div>
                                    <label className="text-sm font-medium block mb-1.5">Models</label>
                                    <Input
                                        placeholder="openai:gpt-4o-mini, anthropic:claude-3-haiku..."
                                        value={blueprint.models.join(', ')}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setBlueprint(p => ({ ...p, models: e.target.value.split(',').map(m => m.trim()).filter(Boolean) }))}
                                    />
                                    <p className="text-xs text-muted-foreground mt-1.5">Comma-separated list of model identifiers.</p>
                                </div>
                            )}
                            {blueprint.system && (
                                <div>
                                    <label className="text-sm font-medium block mb-1.5">System Prompt</label>
                                    <Textarea
                                        placeholder="You are a helpful assistant."
                                        value={blueprint.system}
                                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBlueprint(p => ({ ...p, system: e.target.value }))}
                                        rows={3}
                                    />
                                </div>
                            )}
                            {blueprint.tags && blueprint.tags.length > 0 && (
                                <div>
                                    <label className="text-sm font-medium block mb-1.5">Tags</label>
                                    <Input
                                        placeholder="creative-writing, classification..."
                                        value={blueprint.tags.join(', ')}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setBlueprint(p => ({ ...p, tags: e.target.value.split(',').map(m => m.trim()).filter(Boolean) }))}
                                    />
                                </div>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {blueprint.concurrency !== undefined && (
                                    <div>
                                        <label className="text-sm font-medium block mb-1.5">Concurrency</label>
                                        <Input
                                            type="number"
                                            placeholder="10"
                                            value={blueprint.concurrency}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setBlueprint(p => ({ ...p, concurrency: parseInt(e.target.value, 10) || undefined }))}
                                        />
                                    </div>
                                )}
                                {blueprint.temperature !== undefined && (
                                    <div>
                                        <label className="text-sm font-medium block mb-1.5">Temperature</label>
                                        <Input
                                            type="number"
                                            step="0.1"
                                            placeholder="0.5"
                                            value={blueprint.temperature}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setBlueprint(p => ({ ...p, temperature: parseFloat(e.target.value) || undefined }))}
                                        />
                                    </div>
                                )}
                                 {blueprint.temperatures && blueprint.temperatures.length > 0 && (
                                    <div className="sm:col-span-2 lg:col-span-3">
                                        <label className="text-sm font-medium block mb-1.5">Temperatures (Array)</label>
                                        <Input
                                            placeholder="0.0, 0.5, 1.0"
                                            value={blueprint.temperatures.join(', ')}
                                            onChange={(e: ChangeEvent<HTMLInputElement>) => setBlueprint(p => ({ ...p, temperatures: e.target.value.split(',').map(m => parseFloat(m.trim())).filter(n => !isNaN(n)) }))}
                                        />
                                         <p className="text-xs text-muted-foreground mt-1.5">Array of temperatures overrides single temperature field.</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                <div className="divide-y divide-slate-200/70 dark:divide-slate-800/50">
                    {blueprint.prompts.map((prompt) => (
                        <PromptBlock
                            key={prompt.id}
                            prompt={prompt}
                            onUpdate={handleUpdatePrompt}
                            onRemove={() => handleRemovePrompt(prompt.id)}
                            isAdvancedMode={isAdvancedMode}
                        />
                    ))}
                </div>

                <Button onClick={handleAddPrompt} variant="outline" className="w-full mt-8 py-6 border-dashed">
                    <Plus className="h-5 w-5 mr-2" />
                    Add New Prompt
                </Button>
            </div>
          </div>

          {/* Right Column: YAML Output */}
          <div className="sticky top-20 h-fit max-lg:mt-12">
            <Card className="bg-slate-900 shadow-2xl shadow-slate-900/20 dark:shadow-sky-900/20 border-slate-700">
               <CardHeader>
                  <CardTitle className="text-slate-100 flex items-center gap-2"><Wand2 className="w-5 h-5 text-sky-400"/>Live YAML Editor</CardTitle>
                  <CardDescription className="text-slate-400">Edit here and see the form update, or vice-versa.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                    <CodeMirror
                        value={yamlText}
                        height="600px"
                        extensions={[yamlLanguage()]}
                        onChange={handleYamlChange}
                        theme={resolvedTheme === 'dark' ? githubDark : githubLight}
                        className="rounded-lg overflow-hidden border border-slate-700 dark:border-slate-800"
                    />
                    {yamlError && (
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-red-500/90 text-white text-xs font-mono flex items-center gap-2">
                           <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                           <p className="truncate">YAML Error: {yamlError}</p>
                        </div>
                    )}
                     <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleCopy}
                        className="absolute top-3 right-3 z-10"
                        disabled={!!yamlError}
                      >
                        {isCopied ? <Check className="h-4 w-4 mr-2" /> : <ClipboardCopy className="h-4 w-4 mr-2" />}
                        {isCopied ? 'Copied!' : 'Copy'}
                      </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
} 