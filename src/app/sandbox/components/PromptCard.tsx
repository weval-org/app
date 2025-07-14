'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { AutoExpandTextarea } from '@/components/ui/textarea';
import dynamic from 'next/dynamic';
import React, { useState, useEffect } from 'react';
import {
  ComparisonConfig,
  PointDefinition,
  PromptConfig as WevalPromptConfig,
} from '@/cli/types/cli_types';
import { ExpectationGroup } from './ExpectationGroup';
import { produce } from 'immer';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from '@/components/ui/label';
import { useMobile } from '../hooks/useMobile';
import { Separator } from '@/components/ui/separator';

const Trash2 = dynamic(() => import('lucide-react').then(mod => mod.Trash2));
const Copy = dynamic(() => import('lucide-react').then(mod => mod.Copy));
const Plus = dynamic(() => import('lucide-react').then(mod => mod.Plus));
const CheckCircle = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle));
const X = dynamic(() => import('lucide-react').then(mod => mod.X));

type PromptConfig = WevalPromptConfig;

interface PromptCardProps {
  prompt: PromptConfig;
  onUpdate: (p: PromptConfig) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  isEditable: boolean;
}

export function PromptCard({ prompt, onUpdate, onRemove, onDuplicate, isEditable }: PromptCardProps) {
  const [rubricPaths, setRubricPaths] = useState<(PointDefinition[])[]>([prompt.points || []]);
  const [activeTab, setActiveTab] = useState('path-0');
  const { isMobile } = useMobile();

  useEffect(() => {
      // Reset the paths when the active prompt changes.
      setRubricPaths([prompt.points || []]);
      setActiveTab('path-0');
  }, [prompt.id, prompt.points]);

  const handleUpdatePath = (pathIndex: number, newPoints: PointDefinition[]) => {
      const newPaths = produce(rubricPaths, draft => {
          draft[pathIndex] = newPoints;
      });
      setRubricPaths(newPaths);
      // NOTE: This is a "dumb" component for now.
      // In a real implementation, this would call onUpdate with the modified prompt.
  };

  const handleAddPath = () => {
      const newPaths = produce(rubricPaths, draft => {
          draft.push([]);
      });
      setRubricPaths(newPaths);
      setActiveTab(`path-${newPaths.length - 1}`);
  };

  const handleRemovePath = (pathIndex: number) => {
    if (rubricPaths.length <= 1) return;

    let nextActiveTab = activeTab;
    const deletedTabValue = `path-${pathIndex}`;

    // Determine the next active tab before modifying the paths
    if (activeTab === deletedTabValue) {
        nextActiveTab = `path-${Math.max(0, pathIndex - 1)}`;
    } else {
        const activeIndex = parseInt(activeTab.split('-')[1], 10);
        if (pathIndex < activeIndex) {
            nextActiveTab = `path-${activeIndex - 1}`;
        }
    }

    const newPaths = produce(rubricPaths, draft => {
        draft.splice(pathIndex, 1);
    });

    setRubricPaths(newPaths);
    setActiveTab(nextActiveTab);
  };

  const getPromptText = () => {
    if (!prompt.messages || prompt.messages.length === 0) return '';
    // The prompt is the content of the last message for single-turn, which is what this editor supports
    return prompt.messages[0].content;
  };

  const handlePromptTextChange = (newText: string) => {
    const nextState = produce(prompt, draft => {
        if (!draft.messages || draft.messages.length === 0) {
            draft.messages = [{ role: 'user', content: newText }];
        } else {
            draft.messages[0].content = newText;
        }
    });
    onUpdate(nextState);
  };

  const handleIdealResponseChange = (newText: string) => {
    const nextState = produce(prompt, draft => {
        draft.idealResponse = newText;
    });
    onUpdate(nextState);
  };

  const setField = (field: 'points' | 'should_not', value: any) => {
    const nextState = produce(prompt, draft => {
        (draft as any)[field] = value;
    });
    onUpdate(nextState);
  };

  const hasMultiplePaths = rubricPaths.length > 1;

  let layout: 'base' | 'tabs' | 'horizontal' = 'base';
  if (hasMultiplePaths) {
      if (!isMobile && rubricPaths.length <= 3) {
          layout = 'horizontal';
      } else {
          layout = 'tabs';
      }
  }

  const renderRubric = () => {
    switch (layout) {
        case 'horizontal':
            return (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                        <CheckCircle className="w-4 h-4" />
                        <h4 className="font-semibold text-sm">
                            With as much detail as possible, describe what constitutes a good response:
                        </h4>
                    </div>
                    <div className="pl-6">
                        <p className="text-xs text-muted-foreground mb-2">A valid response must satisfy all criteria in at least ONE of the following paths.</p>
                        <div className="flex flex-row items-start gap-4 pt-2">
                            {rubricPaths.map((path, index) => (
                                <React.Fragment key={index}>
                                    <div className="flex-1 space-y-2 rounded-lg border p-3">
                                        <div className="flex justify-between items-center mb-2">
                                            <p className="font-semibold text-sm text-muted-foreground">Path {index + 1}</p>
                                            {isEditable && (
                                                <button
                                                    onClick={() => handleRemovePath(index)}
                                                    className="rounded-full p-0.5 hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground"
                                                    aria-label={`Remove Path ${index + 1}`}
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        <ExpectationGroup
                                            title={null}
                                            expectations={path || []}
                                            onUpdate={(newPoints) => handleUpdatePath(index, newPoints)}
                                            variant="should"
                                            isEditable={isEditable}
                                        />
                                    </div>
                                    {index < rubricPaths.length - 1 && <Separator orientation="vertical" className="h-auto" />}
                                </React.Fragment>
                            ))}
                            {isEditable && rubricPaths.length < 3 && (
                                <Button size="icon" variant="outline" onClick={handleAddPath} className="h-9 w-9 mt-12 flex-shrink-0" title="Add alternative path">
                                    <Plus className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            );
        case 'tabs':
            return (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                        <CheckCircle className="w-4 h-4" />
                        <h4 className="font-semibold text-sm">
                            With as much detail as possible, describe what constitutes a good response:
                        </h4>
                    </div>
                    <div className="pl-6">
                        <p className="text-xs text-muted-foreground mb-2">A valid response must satisfy all criteria in at least ONE of the following paths.</p>
                        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                            <TabsList>
                                {rubricPaths.map((_, index) => (
                                    <TabsTrigger key={index} value={`path-${index}`} className="pr-2">
                                        Path {index + 1}
                                        {isEditable && rubricPaths.length > 1 && (
                                            <button
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    handleRemovePath(index);
                                                }}
                                                className="ml-2 rounded-full p-0.5 hover:bg-muted-foreground/20"
                                                aria-label={`Remove Path ${index + 1}`}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </TabsTrigger>
                                ))}
                                {isEditable && (
                                    <Button size="icon" variant="ghost" onClick={handleAddPath} className="h-9 w-9 ml-1" title="Add alternative path">
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                )}
                            </TabsList>
                            {rubricPaths.map((path, index) => (
                                <TabsContent key={index} value={`path-${index}`} className="pt-2">
                                    <ExpectationGroup
                                        title={null}
                                        expectations={path || []}
                                        onUpdate={(newPoints) => handleUpdatePath(index, newPoints)}
                                        variant="should"
                                        isEditable={isEditable}
                                    />
                                </TabsContent>
                            ))}
                        </Tabs>
                    </div>
                </div>
            );
        case 'base':
        default:
            return (
                <div>
                    <ExpectationGroup
                        title="With as much detail as possible, describe what constitutes a good response:"
                        expectations={rubricPaths[0] || []}
                        onUpdate={(newPoints) => handleUpdatePath(0, newPoints)}
                        variant="should"
                        isEditable={isEditable}
                    />
                </div>
            );
    }
  };

  return (
    <Card className="relative" id={prompt.id}>
        {isEditable && (
            <div className="absolute top-2.5 right-2.5 z-10 flex items-center">
                 <Button
                    variant="ghost"
                    size="icon"
                    onClick={onDuplicate}
                    className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-7 w-7"
                    title="Duplicate Prompt"
                >
                    <Copy className="h-3.5 w-3.5" />
                </Button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-7 w-7"
                            title="Remove Prompt"
                            aria-label="Remove prompt"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuLabel>Are you sure?</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                            Yes, delete this prompt
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        )}
        <CardContent className="p-4">
            <div className="space-y-4">
                <div>
                <label className="text-sm font-semibold text-foreground">Prompt</label>
                <p className="text-xs text-muted-foreground mb-1.5">The exact question or instruction for the AI. Be specific.</p>
                
                {prompt.messages && prompt.messages.length > 1 ? (
                    <div className="space-y-2 rounded-md border p-3 bg-muted/50">
                        {prompt.messages.map((message, index) => (
                            <div key={index} className="flex flex-col">
                                <span className="text-xs font-semibold capitalize text-muted-foreground">{message.role}</span>
                                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                            </div>
                        ))}
                        <p className="text-xs text-center text-muted-foreground pt-2">Multi-turn prompts are currently read-only in the form view.</p>
                    </div>
                ) : (
                    <AutoExpandTextarea
                        placeholder="e.g., Write a short story about a robot who discovers music."
                        value={getPromptText()}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handlePromptTextChange(e.target.value)}
                        minRows={2}
                        maxRows={8}
                        className="text-sm"
                        readOnly={!isEditable}
                    />
                )}
                </div>
                <div>
                <label className="text-sm font-semibold text-foreground">Ideal Response <span className="text-xs font-normal text-muted-foreground">(Optional)</span></label>
                <p className="text-xs text-muted-foreground mb-1.5">A "gold-standard" answer to compare against for semantic similarity.</p>
                <AutoExpandTextarea
                    placeholder="e.g., Unit 734 processed the auditory input..."
                    value={prompt.idealResponse || ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleIdealResponseChange(e.target.value)}
                    minRows={2}
                    maxRows={8}
                    className="text-sm"
                    readOnly={!isEditable}
                />
                </div>
                <div className="space-y-3">
                    {renderRubric()}
                    {/* 
                    Temporarily deprecated - users can express negative criteria using plain language 
                    in the "should" section instead (e.g., "should be professional and avoid slang")
                    ONLY show it if the YAML has a "should_not" section
                    */}
                    {prompt.should_not && prompt.should_not.length > 0 && (
                    <ExpectationGroup
                        title="The response SHOULD NOT..."
                        expectations={prompt.should_not || []}
                        onUpdate={exps => setField('should_not', exps)}
                        variant="should-not"
                        isEditable={isEditable}
                    />)}
                </div>
            </div>
        </CardContent>
        {isEditable && layout === 'base' && (
            <CardFooter className="px-4 pb-4 pt-0">
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleAddPath}
                    className="text-muted-foreground h-8 p-1 font-medium -ml-1"
                >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Alternative Path
                </Button>
            </CardFooter>
        )}
    </Card>
  );
} 