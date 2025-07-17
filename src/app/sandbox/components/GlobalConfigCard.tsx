'use client';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AutoExpandTextarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ComparisonConfig } from '@/cli/types/cli_types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import dynamic from 'next/dynamic';
import { produce } from 'immer';
import React from 'react';
// import { ModelSelector } from './ModelSelector'; // To be created

const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const Plus = dynamic(() => import('lucide-react').then(mod => mod.Plus));
const Trash2 = dynamic(() => import('lucide-react').then(mod => mod.Trash2));
const Info = dynamic(() => import('lucide-react').then(mod => mod.Info));

interface GlobalConfigCardProps {
  blueprint: ComparisonConfig;
  onUpdate: (bp: ComparisonConfig) => void;
  isEditable: boolean; // Controls if the form fields are interactive
  isAdvancedMode: boolean;
}

export function GlobalConfigCard({ blueprint, onUpdate, isEditable, isAdvancedMode }: GlobalConfigCardProps) {

  // Handle the case where 'system' is provided as an array (should be normalized to 'systems')
  React.useEffect(() => {
    if (Array.isArray(blueprint.system) && (!blueprint.systems || blueprint.systems.length === 0)) {
      // Convert system array to systems array
      const nextBlueprint = produce(blueprint, draft => {
        draft.systems = blueprint.system as unknown as (string | null)[];
        draft.system = undefined;
      });
      onUpdate(nextBlueprint);
    }
  }, [blueprint.system, blueprint.systems, onUpdate]);

  const handleFieldChange = <K extends keyof ComparisonConfig>(field: K, value: ComparisonConfig[K]) => {
    // Prevent phantom updates on initial render for optional fields
    if (blueprint[field] === undefined && value === '') {
      return;
    }
    onUpdate({ ...blueprint, [field]: value });
  };

  const handleSystemsChange = (newSystems: (string | null)[]) => {
    const nextBlueprint = produce(blueprint, draft => {
      draft.systems = newSystems;
      // Clear single system field if we're using systems array
      if (newSystems.length > 0) {
        draft.system = undefined;
      }
    });
    onUpdate(nextBlueprint);
  };

  const handleSingleSystemChange = (value: string) => {
    const nextBlueprint = produce(blueprint, draft => {
      draft.system = value || undefined;
      // Clear systems array if we're using single system
      if (value) {
        draft.systems = undefined;
      }
    });
    onUpdate(nextBlueprint);
  };

  const addSystemPrompt = () => {
    const currentSystems = blueprint.systems || [];
    handleSystemsChange([...currentSystems, '']);
  };

  const updateSystemPrompt = (index: number, value: string) => {
    const currentSystems = blueprint.systems || [];
    const newSystems = produce(currentSystems, draft => {
      // Convert empty string to null for "no system prompt" variant
      draft[index] = value.trim() === '' ? null : value;
    });
    handleSystemsChange(newSystems);
  };

  const removeSystemPrompt = (index: number) => {
    const currentSystems = blueprint.systems || [];
    const newSystems = produce(currentSystems, draft => {
      draft.splice(index, 1);
    });
    handleSystemsChange(newSystems);
  };

  const switchToMultipleSystemPrompts = () => {
    const currentSystem = blueprint.system || '';
    handleSystemsChange([currentSystem === '' ? null : currentSystem, '']);
  };

  const switchToSingleSystemPrompt = () => {
    const firstSystem = blueprint.systems?.[0];
    handleSingleSystemChange(firstSystem || '');
  };

  const isUsingMultipleSystems = blueprint.systems && blueprint.systems.length > 0;

  return (
    <Card className="p-4">
        <div className="space-y-4">
            <div>
                <label className="text-sm font-semibold text-foreground" htmlFor="blueprint-title">Blueprint Title</label>
                <p className="text-xs text-muted-foreground mb-1.5">A short, descriptive title for your evaluation.</p>
                <Input
                    id="blueprint-title"
                    type="text" 
                    placeholder="e.g., Clinical Accuracy Test"
                    value={blueprint.title}
                    onChange={(e) => handleFieldChange('title', e.target.value)}
                    className="text-sm"
                    readOnly={!isEditable}
                />
            </div>
            {isAdvancedMode && (
                <>
                    <div>
                        <label className="text-sm font-semibold text-foreground" htmlFor="blueprint-description">Description</label>
                        <p className="text-xs text-muted-foreground mb-1.5">A brief explanation of what this blueprint is designed to test.</p>
                        <AutoExpandTextarea
                            id="blueprint-description"
                            placeholder="e.g., Tests a model's ability to provide safe and accurate medical information."
                            value={blueprint.description || ''}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange('description', e.target.value)}
                            minRows={2}
                            maxRows={6}
                            className="text-sm"
                            readOnly={!isEditable}
                        />
                    </div>
                    
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-semibold text-foreground">
                                System Prompt{isUsingMultipleSystems ? 's' : ''} (Optional)
                            </label>
                            {isEditable && (
                                <div className="flex gap-2">
                                    {!isUsingMultipleSystems ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={switchToMultipleSystemPrompts}
                                            className="text-xs"
                                        >
                                            <Plus className="h-3 w-3 mr-1" />
                                            Add Variants
                                        </Button>
                                    ) : (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={switchToSingleSystemPrompt}
                                            className="text-xs"
                                        >
                                            Use Single Prompt
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                        
                        {isUsingMultipleSystems ? (
                            <div className="space-y-3">
                                <div className="flex items-start space-x-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                    <div className="text-xs text-blue-800 dark:text-blue-200">
                                        <p className="font-medium mb-1">Multiple System Prompt Variants</p>
                                        <p>Each system prompt variant will be tested separately, allowing you to compare how different system prompts affect model performance. Leave a field empty to test with no system prompt for that variant.</p>
                                    </div>
                                </div>
                                
                                {blueprint.systems?.map((systemPrompt, index) => (
                                    <div key={index} className="relative">
                                        <div className="flex items-center gap-2 mb-1">
                                            <label className="text-xs font-medium text-muted-foreground">
                                                Variant {index + 1}
                                            </label>
                                            {isEditable && blueprint.systems && blueprint.systems.length > 1 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeSystemPrompt(index)}
                                                    className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            )}
                                        </div>
                                        <AutoExpandTextarea
                                            placeholder={index === 0 ? "You are a helpful assistant." : "Enter a different system prompt, or leave empty for no system prompt."}
                                            value={systemPrompt || ''}
                                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateSystemPrompt(index, e.target.value)}
                                            minRows={2}
                                            maxRows={6}
                                            className="text-sm"
                                            readOnly={!isEditable}
                                        />
                                    </div>
                                ))}
                                
                                {isEditable && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={addSystemPrompt}
                                        className="w-full"
                                    >
                                        <Plus className="h-3 w-3 mr-1" />
                                        Add System Prompt Variant
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <div>
                                <AutoExpandTextarea
                                    id="blueprint-system"
                                    placeholder="You are a helpful assistant."
                                    value={blueprint.system || ''}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleSingleSystemChange(e.target.value)}
                                    minRows={2}
                                    maxRows={6}
                                    className="text-sm"
                                    readOnly={!isEditable}
                                />
                                <p className="text-xs text-muted-foreground mt-1">A global system prompt to be used for all test cases in this blueprint.</p>
                            </div>
                        )}
                    </div>
                </>
            )}
            {/*
            <div>
                <label className="text-base font-semibold text-foreground">Models</label>
                <p className="text-sm text-muted-foreground mb-2">The AI models you want to test.</p>
                <ModelSelector
                    selectedModels={blueprint.models || []}
                    onSelectionChange={(models) => handleFieldChange('models', models)}
                />
            </div>
            */}
            {blueprint.models && blueprint.models.length > 0 && (
                 <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Models Will Be Ignored</AlertTitle>
                    <AlertDescription>
                        Defining models in the blueprint is not supported within the sandbox. Models for evaluation are selected when you click &quot;Run Evaluation.&quot; If you want to submit this as a proposal, please remove the <code>models</code> field.
                    </AlertDescription>
                </Alert>
            )}
        </div>
    </Card>
  );
} 