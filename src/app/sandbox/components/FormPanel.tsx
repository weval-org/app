'use client';

import React, { useState, useEffect } from 'react';
import * as yaml from 'js-yaml';
import { useDebouncedCallback } from 'use-debounce';
import { ActiveBlueprint } from '../hooks/useWorkspace';
import { ComparisonConfig, PointDefinition, PromptConfig } from '@/cli/types/cli_types';
import { parseAndNormalizeBlueprint } from '@/lib/blueprint-parser';
import { Skeleton } from '@/components/ui/skeleton';
import { GlobalConfigCard } from './GlobalConfigCard';
import { PromptCard } from './PromptCard';
import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import { produce } from 'immer';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { AutoExtendModal } from './AutoExtendModal';
import { useToast } from '@/components/ui/use-toast';

const Plus = dynamic(() => import('lucide-react').then(mod => mod.Plus));
const Sparkles = dynamic(() => import('lucide-react').then(mod => mod.Sparkles));
const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));

interface FormPanelProps {
    parsedBlueprint: ComparisonConfig | null;
    onUpdate: (newConfig: ComparisonConfig) => void;
    isLoading: boolean;
    isSaving: boolean;
    isEditable: boolean;
}

export function FormPanel({ parsedBlueprint, onUpdate, isLoading, isSaving, isEditable }: FormPanelProps) {
    const [promptToDeleteIndex, setPromptToDeleteIndex] = useState<number | null>(null);
    const [isAutoExtendModalOpen, setIsAutoExtendModalOpen] = useState(false);
    const [isExtending, setIsExtending] = useState(false);
    const { toast } = useToast();

    const handleUpdate = (newConfig: ComparisonConfig) => {
        onUpdate(newConfig);
    };

    const handleUpdatePrompt = (index: number, updatedPrompt: PromptConfig) => {
        if (!parsedBlueprint) return;
        const nextState = produce(parsedBlueprint, draft => {
            draft.prompts[index] = updatedPrompt;
        });
        onUpdate(nextState);
    };

    const handleAddPrompt = () => {
        if (!parsedBlueprint) return;
        const newPrompt: PromptConfig = {
            id: `prompt-${Date.now()}`,
            messages: [{ role: 'user', content: '' }],
        };
        const nextState = produce(parsedBlueprint, draft => {
            draft.prompts.push(newPrompt);
        });
        onUpdate(nextState);
    };

    const handleRequestRemovePrompt = (index: number) => {
        setPromptToDeleteIndex(index);
    };

    const handleConfirmRemovePrompt = () => {
        if (promptToDeleteIndex === null) return;
        if (!parsedBlueprint) return;
        const nextState = produce(parsedBlueprint, draft => {
            draft.prompts.splice(promptToDeleteIndex, 1);
        });
        onUpdate(nextState);
        setPromptToDeleteIndex(null);
    };

    const handleDuplicatePrompt = (index: number) => {
        if (!parsedBlueprint) return;
        const originalPrompt = parsedBlueprint.prompts[index];
        
        // Deep copy and assign a new unique ID
        const duplicatedPrompt = JSON.parse(JSON.stringify(originalPrompt));
        duplicatedPrompt.id = `prompt-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const nextState = produce(parsedBlueprint, draft => {
            draft.prompts.splice(index + 1, 0, duplicatedPrompt);
        });
        onUpdate(nextState);
    };

    const stringifyPoint = (p: PointDefinition) => JSON.stringify(p);

    const handleAutoExtend = async (guidance: string) => {
        if (!parsedBlueprint) return;
        setIsExtending(true);
        setIsAutoExtendModalOpen(false);

        try {
            const existingBlueprintContent = yaml.dump(parsedBlueprint);
            const response = await fetch('/api/sandbox/auto-extend', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ existingBlueprintContent, guidance }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to extend blueprint.');
            }

            const newBlueprint = parseAndNormalizeBlueprint(data.yaml, 'yaml');

            // --- Validation Logic ---
            const existingPromptsMap = new Map(parsedBlueprint.prompts.map(p => [p.id, p]));
            
            for (const newPrompt of newBlueprint.prompts) {
                if (existingPromptsMap.has(newPrompt.id)) {
                    const existingPrompt = existingPromptsMap.get(newPrompt.id)!;
                    
                    // It must not change the core prompt text
                    if (JSON.stringify(newPrompt.messages) !== JSON.stringify(existingPrompt.messages)) {
                         throw new Error(`Auto-extend failed validation: It tried to modify the text of an existing prompt (ID: ${newPrompt.id}).`);
                    }

                    // 'points' must be additive
                    const existingPoints = new Set((existingPrompt.points || []).map(stringifyPoint));
                    const newPoints = newPrompt.points || [];
                    for(const p of newPoints) {
                        if (!existingPoints.has(stringifyPoint(p))) {
                            // This is a new point, which is allowed
                        } else {
                            existingPoints.delete(stringifyPoint(p)); // Remove found point
                        }
                    }
                    if (existingPoints.size > 0) {
                        throw new Error(`Auto-extend failed validation: It tried to remove a 'should' criteria from prompt ID ${newPrompt.id}.`);
                    }

                    // 'should_not' must be additive
                    const existingShouldNot = new Set((existingPrompt.should_not || []).map(stringifyPoint));
                    const newShouldNot = newPrompt.should_not || [];
                     for(const p of newShouldNot) {
                        if (!existingShouldNot.has(stringifyPoint(p))) {
                           // new point, allowed
                        } else {
                            existingShouldNot.delete(stringifyPoint(p));
                        }
                    }
                    if (existingShouldNot.size > 0) {
                        throw new Error(`Auto-extend failed validation: It tried to remove a 'should_not' criteria from prompt ID ${newPrompt.id}.`);
                    }
                }
            }
            
            toast({ title: 'Blueprint Extended!', description: 'The AI has added to your blueprint.' });
            onUpdate(newBlueprint);

        } catch (error: any) {
            console.error('Auto-extend error:', error);
            toast({ variant: 'destructive', title: 'Extension Failed', description: error.message, duration: 8000 });
        } finally {
            setIsExtending(false);
        }
    };

    if (isLoading) {
        return (
            <div className="p-3 space-y-3 h-full bg-background">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-48 w-full" />
            </div>
        );
    }

    if (!parsedBlueprint) {
        return (
            <div className="p-3 h-full bg-background flex items-center justify-center text-muted-foreground">
                <p>{'Select a blueprint to begin or fix the errors in the YAML.'}</p>
            </div>
        );
    }

    return (
        <div className="p-3 space-y-3 bg-background relative">
             {isExtending && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    <p className="text-lg font-semibold">AI is extending your blueprint...</p>
                    <p className="text-sm text-muted-foreground">This may take a moment.</p>
                </div>
            )}
            <GlobalConfigCard 
                blueprint={parsedBlueprint}
                onUpdate={handleUpdate}
                isEditable={isEditable}
            />
            <div className="space-y-3">
                {parsedBlueprint.prompts.map((prompt, index) => (
                    <PromptCard
                        key={prompt.id || index}
                        prompt={prompt}
                        onUpdate={(p) => handleUpdatePrompt(index, p)}
                        onRemove={() => handleRequestRemovePrompt(index)}
                        onDuplicate={() => handleDuplicatePrompt(index)}
                        isEditable={isEditable}
                    />
                ))}
            </div>
            <div className="flex items-center justify-center gap-4 pt-2 pb-12">
                <Button 
                    variant="outline" 
                    disabled={!isEditable}
                    size="sm"
                    onClick={handleAddPrompt}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Prompt
                </Button>
                <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAutoExtendModalOpen(true)}
                    disabled={isExtending}
                    className="bg-exciting text-exciting-foreground border-exciting hover:bg-exciting/90 hover:text-exciting-foreground"
                >
                    <Sparkles className="h-4 w-4 mr-2" />
                        {isExtending ? 'Extending...' : 'Auto-extend'}
                </Button>
            </div>
            <Dialog open={promptToDeleteIndex !== null} onOpenChange={(isOpen) => !isOpen && setPromptToDeleteIndex(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Are you absolutely sure?</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. This will permanently delete the prompt.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setPromptToDeleteIndex(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleConfirmRemovePrompt}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <AutoExtendModal
                isOpen={isAutoExtendModalOpen}
                onOpenChange={setIsAutoExtendModalOpen}
                onConfirm={handleAutoExtend}
                isSubmitting={isExtending}
            />
        </div>
    );
} 