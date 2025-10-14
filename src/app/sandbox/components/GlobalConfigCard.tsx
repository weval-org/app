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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import Icon from '@/components/ui/icon';
import { PointDefsEditor } from './PointDefsEditor';

interface GlobalConfigCardProps {
  blueprint: ComparisonConfig;
  onUpdate: (bp: ComparisonConfig) => void;
  isEditable: boolean; // Controls if the form fields are interactive
  isAdvancedMode: boolean;
}

export function GlobalConfigCard({ blueprint, onUpdate, isEditable, isAdvancedMode }: GlobalConfigCardProps) {
  const [isConfirmingSwitch, setIsConfirmingSwitch] = React.useState(false);
  const isDev = process.env.NODE_ENV === 'development';

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
      // Clear systems array if we're using single system.
      // This should always happen when this function is called.
      draft.systems = undefined;
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
    // A populated prompt is one that is not null and not just whitespace
    const populatedPrompts = blueprint.systems?.filter(s => s && s.trim() !== '').length || 0;

    if (populatedPrompts > 1) {
      setIsConfirmingSwitch(true);
    } else {
      const firstSystem = blueprint.systems?.[0];
      handleSingleSystemChange(firstSystem || '');
    }
  };

  const confirmSwitchToSingle = () => {
    const firstSystem = blueprint.systems?.[0];
    handleSingleSystemChange(firstSystem || '');
    setIsConfirmingSwitch(false);
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

                    {/* Author attribution */}
                    <div>
                        <label className="text-sm font-semibold text-foreground" htmlFor="blueprint-author">Author (optional)</label>
                        <p className="text-xs text-muted-foreground mb-1.5">Credit the author or source. Use a simple name or name with link and image.</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <Input
                                id="blueprint-author"
                                type="text"
                                placeholder="Name"
                                value={typeof (blueprint as any).author === 'string' ? (blueprint as any).author : ((blueprint as any).author?.name || '')}
                                onChange={(e) => {
                                    const current = (blueprint as any).author;
                                    const next = produce(blueprint, draft => {
                                        const value = e.target.value;
                                        if (!value) {
                                            (draft as any).author = undefined;
                                        } else if (typeof current === 'string' || current === undefined) {
                                            (draft as any).author = { name: value };
                                        } else {
                                            (draft as any).author = { ...current, name: value };
                                        }
                                    });
                                    onUpdate(next);
                                }}
                                className="text-sm"
                                readOnly={!isEditable}
                            />
                            <Input
                                type="url"
                                placeholder="URL (optional)"
                                value={typeof (blueprint as any).author === 'string' ? '' : ((blueprint as any).author?.url || '')}
                                onChange={(e) => {
                                    const next = produce(blueprint, draft => {
                                        const val = e.target.value;
                                        if (!(draft as any).author || typeof (draft as any).author === 'string') {
                                            (draft as any).author = { name: ((draft as any).author && typeof (draft as any).author === 'string') ? (draft as any).author : (draft.title || 'Author'), url: val };
                                        } else {
                                            (draft as any).author.url = val;
                                        }
                                        // Clean empty fields
                                        if ((draft as any).author && !(draft as any).author.url) delete (draft as any).author.url;
                                    });
                                    onUpdate(next);
                                }}
                                className="text-sm"
                                readOnly={!isEditable}
                            />
                            <Input
                                type="url"
                                placeholder="Image URL (optional)"
                                value={typeof (blueprint as any).author === 'string' ? '' : ((blueprint as any).author?.image_url || '')}
                                onChange={(e) => {
                                    const next = produce(blueprint, draft => {
                                        const val = e.target.value;
                                        if (!(draft as any).author || typeof (draft as any).author === 'string') {
                                            (draft as any).author = { name: ((draft as any).author && typeof (draft as any).author === 'string') ? (draft as any).author : (draft.title || 'Author'), image_url: val };
                                        } else {
                                            (draft as any).author.image_url = val;
                                        }
                                        if ((draft as any).author && !(draft as any).author.image_url) delete (draft as any).author.image_url;
                                    });
                                    onUpdate(next);
                                }}
                                className="text-sm"
                                readOnly={!isEditable}
                            />
                        </div>
                    </div>

                    {/* References */}
                    <div>
                        <label className="text-sm font-semibold text-foreground">References (optional)</label>
                        <p className="text-xs text-muted-foreground mb-1.5">Credit source papers, datasets, or other references this blueprint is based on.</p>
                        <div className="space-y-3">
                            {((blueprint as any).references || []).map((ref: any, index: number) => (
                                <div key={index} className="flex items-center gap-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-grow">
                                        <Input
                                            type="text"
                                            placeholder="Title or citation"
                                            value={ref.title || ''}
                                            onChange={(e) => {
                                                const next = produce(blueprint, draft => {
                                                    if (!(draft as any).references) (draft as any).references = [];
                                                    (draft as any).references[index].title = e.target.value;
                                                });
                                                onUpdate(next);
                                            }}
                                            className="text-sm"
                                            readOnly={!isEditable}
                                        />
                                        <Input
                                            type="url"
                                            placeholder="URL (optional)"
                                            value={ref.url || ''}
                                            onChange={(e) => {
                                                const next = produce(blueprint, draft => {
                                                    if (!(draft as any).references) (draft as any).references = [];
                                                    (draft as any).references[index].url = e.target.value;
                                                });
                                                onUpdate(next);
                                            }}
                                            className="text-sm"
                                            readOnly={!isEditable}
                                        />
                                    </div>
                                    {isEditable && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                const next = produce(blueprint, draft => {
                                                    (draft as any).references.splice(index, 1);
                                                });
                                                onUpdate(next);
                                            }}
                                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        >
                                            <Icon name="trash" className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                            {isEditable && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        const next = produce(blueprint, draft => {
                                            if (!(draft as any).references) (draft as any).references = [];
                                            (draft as any).references.push({ title: '', url: '' });
                                        });
                                        onUpdate(next);
                                    }}
                                    className="w-full"
                                >
                                    <Icon name="plus" className="h-3 w-3 mr-1" />
                                    Add Reference
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Tool-Use Configuration (trace-only) */}
                    <div>
                        <label className="text-sm font-semibold text-foreground">Tool-Use Configuration (Trace-Only)</label>
                        <p className="text-xs text-muted-foreground mb-3">
                            Define tools and evaluation policy for trace-only tool-use testing. Models emit structured tool calls that are parsed and validated without execution.
                        </p>

                        {/* Tool-Use Policy */}
                        <div className="space-y-3 p-3 bg-muted/30 rounded-md border mb-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <label className="text-sm font-medium text-foreground">Enable Tool-Use Evaluation</label>
                                    <p className="text-xs text-muted-foreground">Test models on their ability to format and sequence tool calls correctly</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="tooluse-enabled"
                                        checked={!!(blueprint as any).toolUse?.enabled}
                                        onCheckedChange={(checked) => {
                                            const next = produce(blueprint, draft => {
                                                if (!draft.toolUse) (draft as any).toolUse = {};
                                                (draft as any).toolUse.enabled = checked;
                                                // Set defaults when enabling
                                                if (checked) {
                                                    if (!(draft as any).toolUse.mode) (draft as any).toolUse.mode = 'trace-only';
                                                    if (!(draft as any).toolUse.outputFormat) (draft as any).toolUse.outputFormat = 'json-line';
                                                }
                                            });
                                            onUpdate(next);
                                        }}
                                        disabled={!isEditable}
                                    />
                                </div>
                            </div>

                            {(blueprint as any).toolUse?.enabled && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t">
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Mode</label>
                                        <Select
                                            value={(blueprint as any).toolUse?.mode || 'trace-only'}
                                            onValueChange={(value) => {
                                                const next = produce(blueprint, draft => {
                                                    if (!(draft as any).toolUse) (draft as any).toolUse = {};
                                                    (draft as any).toolUse.mode = value;
                                                });
                                                onUpdate(next);
                                            }}
                                            disabled={!isEditable}
                                        >
                                            <SelectTrigger className="text-xs h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="trace-only">trace-only</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Output Format</label>
                                        <Select
                                            value={(blueprint as any).toolUse?.outputFormat || 'json-line'}
                                            onValueChange={(value) => {
                                                const next = produce(blueprint, draft => {
                                                    if (!(draft as any).toolUse) (draft as any).toolUse = {};
                                                    (draft as any).toolUse.outputFormat = value;
                                                });
                                                onUpdate(next);
                                            }}
                                            disabled={!isEditable}
                                        >
                                            <SelectTrigger className="text-xs h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="json-line">json-line</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-muted-foreground">Max Steps</label>
                                        <Input
                                            type="number"
                                            placeholder="e.g., 4"
                                            value={(blueprint as any).toolUse?.maxSteps || ''}
                                            onChange={(e) => {
                                                const next = produce(blueprint, draft => {
                                                    if (!(draft as any).toolUse) (draft as any).toolUse = {};
                                                    const val = parseInt(e.target.value);
                                                    (draft as any).toolUse.maxSteps = isNaN(val) ? undefined : val;
                                                });
                                                onUpdate(next);
                                            }}
                                            className="text-xs h-8"
                                            readOnly={!isEditable}
                                            min={1}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Tools Definition */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-foreground">Tools Inventory</label>
                                {isEditable && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            const next = produce(blueprint, draft => {
                                                if (!(draft as any).tools) (draft as any).tools = [];
                                                (draft as any).tools.push({ name: '', description: '', schema: { type: 'object', properties: {}, required: [] } });
                                            });
                                            onUpdate(next);
                                        }}
                                        className="h-7 text-xs"
                                    >
                                        <Icon name="plus" className="h-3 w-3 mr-1" />
                                        Add Tool
                                    </Button>
                                )}
                            </div>

                            {((blueprint as any).tools && (blueprint as any).tools.length > 0) ? (
                                <div className="space-y-3">
                                    {(blueprint as any).tools.map((tool: any, index: number) => (
                                        <div key={index} className="p-3 border rounded-md bg-background space-y-2">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-xs font-medium text-muted-foreground">Tool {index + 1}</span>
                                                {isEditable && (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                            >
                                                                <Icon name="trash" className="h-3 w-3" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent>
                                                            <DropdownMenuLabel>Are you sure?</DropdownMenuLabel>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    const next = produce(blueprint, draft => {
                                                                        (draft as any).tools.splice(index, 1);
                                                                    });
                                                                    onUpdate(next);
                                                                }}
                                                                className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                                            >
                                                                Delete Tool
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                )}
                                            </div>

                                            <div>
                                                <label className="text-xs font-medium text-muted-foreground">Tool Name *</label>
                                                <Input
                                                    type="text"
                                                    placeholder="e.g., calculator, search, retrieve"
                                                    value={tool.name || ''}
                                                    onChange={(e) => {
                                                        const next = produce(blueprint, draft => {
                                                            (draft as any).tools[index].name = e.target.value;
                                                        });
                                                        onUpdate(next);
                                                    }}
                                                    className="text-xs h-8 mt-1"
                                                    readOnly={!isEditable}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs font-medium text-muted-foreground">Description</label>
                                                <AutoExpandTextarea
                                                    placeholder="Brief description of what this tool does"
                                                    value={tool.description || ''}
                                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                                                        const next = produce(blueprint, draft => {
                                                            (draft as any).tools[index].description = e.target.value;
                                                        });
                                                        onUpdate(next);
                                                    }}
                                                    minRows={1}
                                                    maxRows={3}
                                                    className="text-xs mt-1"
                                                    readOnly={!isEditable}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-xs font-medium text-muted-foreground">JSON Schema (optional)</label>
                                                <AutoExpandTextarea
                                                    placeholder={'{\n  "type": "object",\n  "properties": {\n    "arg1": { "type": "string" }\n  },\n  "required": ["arg1"]\n}'}
                                                    value={tool.schema ? JSON.stringify(tool.schema, null, 2) : ''}
                                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                                                        const next = produce(blueprint, draft => {
                                                            try {
                                                                const parsed = JSON.parse(e.target.value || '{}');
                                                                (draft as any).tools[index].schema = parsed;
                                                            } catch {
                                                                // Keep existing schema if parse fails
                                                            }
                                                        });
                                                        onUpdate(next);
                                                    }}
                                                    minRows={3}
                                                    maxRows={10}
                                                    className="text-xs mt-1 font-mono"
                                                    readOnly={!isEditable}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 text-center text-xs text-muted-foreground bg-muted/20 rounded-md border border-dashed">
                                    No tools defined. Click &quot;Add Tool&quot; to create your first tool definition.
                                </div>
                            )}
                        </div>
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
                                            <Icon name="plus" className="h-3 w-3 mr-1" />
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
                                    <Icon name="info" className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
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
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        >
                                                            <Icon name="trash" className="h-3 w-3" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent>
                                                        <DropdownMenuLabel>Are you sure?</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => removeSystemPrompt(index)}
                                                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                                        >
                                                            Delete Variant
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
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
                                        <Icon name="plus" className="h-3 w-3 mr-1" />
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

                    {/* Reusable Point-Functions */}
                    <div>
                        <label className="text-sm font-semibold text-foreground">Reusable Point-Functions</label>
                        <p className="text-xs text-muted-foreground mb-1.5">Define JavaScript snippets you can reference in prompts with <code>$ref</code>.</p>
                        <PointDefsEditor
                            pointDefs={blueprint.point_defs}
                            onChange={(defs)=> onUpdate({ ...blueprint, point_defs: defs })}
                            isEditable={isEditable}
                        />
                    </div>

                    {/* Response Rendering Mode */}
                    <div>
                        <label className="text-sm font-semibold text-foreground" htmlFor="blueprint-render-as">Response Rendering Mode (optional)</label>
                        <p className="text-xs text-muted-foreground mb-1.5">Default rendering format for model responses. Can be overridden per-prompt.</p>
                        <Select
                            value={(blueprint as any).render_as || 'markdown'}
                            onValueChange={(value) => handleFieldChange('render_as' as any, value === 'markdown' ? undefined : value)}
                            disabled={!isEditable}
                        >
                            <SelectTrigger id="blueprint-render-as" className="text-sm">
                                <SelectValue placeholder="Select rendering mode" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="markdown">Markdown (default)</SelectItem>
                                <SelectItem value="html">HTML</SelectItem>
                                <SelectItem value="plaintext">Plain Text</SelectItem>
                            </SelectContent>
                        </Select>
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
            {!isDev && blueprint.models && blueprint.models.length > 0 && (
                 <Alert variant="destructive">
                    <Icon name="alert-triangle" className="h-4 w-4" />
                    <AlertTitle>Models Will Be Ignored</AlertTitle>
                    <AlertDescription>
                        Defining models in the blueprint is not supported within the sandbox. Models for evaluation are selected when you click &quot;Run Evaluation.&quot; If you want to submit this as a proposal, please remove the <code>models</code> field.
                    </AlertDescription>
                </Alert>
            )}
        </div>
        <Dialog open={isConfirmingSwitch} onOpenChange={setIsConfirmingSwitch}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Switch to a single system prompt?</DialogTitle>
                    <DialogDescription>
                        You have multiple populated system prompt variants. Switching to a single prompt will discard all but the first one. This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setIsConfirmingSwitch(false)}>Cancel</Button>
                    <Button variant="destructive" onClick={confirmSwitchToSingle}>
                        Confirm and Discard
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </Card>
  );
} 