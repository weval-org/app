'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { AutoExpandTextarea } from '@/components/ui/textarea';
import React, { useState, useEffect } from 'react';
import {
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMobile } from '../hooks/useMobile';
import Icon from '@/components/ui/icon';

type PromptConfig = WevalPromptConfig;

interface PromptCardProps {
  prompt: PromptConfig;
  onUpdate: (p: PromptConfig) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  isEditable: boolean;
  isAdvancedMode: boolean;
}

export function PromptCard({ prompt, onUpdate, onRemove, onDuplicate, isEditable, isAdvancedMode }: PromptCardProps) {
  const [requiredPoints, setRequiredPoints] = useState<PointDefinition[]>([]);
  const [alternativePaths, setAlternativePaths] = useState<(PointDefinition[])[]>([]);
  const [activeTab, setActiveTab] = useState('path-0');
  const { isMobile } = useMobile();

  useEffect(() => {
    const points = prompt.points || [];
    const reqs = points.filter(p => !Array.isArray(p)) as PointDefinition[];
    const alts = points.filter(p => Array.isArray(p)) as (PointDefinition[])[];

    setRequiredPoints(reqs);
    setAlternativePaths(alts);

    if (alts.length > 0) {
      setActiveTab('path-0');
    }
  }, [prompt.points]);

  const serializeAndPropagateUpdate = (
    newRequired: PointDefinition[],
    newAlts: (PointDefinition[])[]
  ) => {
    // We don't filter empty paths here, to allow the user to have an empty path while editing.
    // The YAML generator or parser can handle final cleanup if needed.
    const serializedPoints: PointDefinition[] = [...newRequired, ...newAlts];
    
    const nextState = produce(prompt, draft => {
      draft.points = serializedPoints;
    });
    onUpdate(nextState);
  };

  const handleUpdateRequired = (newPoints: PointDefinition[]) => {
    setRequiredPoints(newPoints);
    serializeAndPropagateUpdate(newPoints, alternativePaths);
  };

  const handleUpdateAlternativePath = (pathIndex: number, newPoints: PointDefinition[]) => {
    const newPaths = produce(alternativePaths, draft => {
      draft[pathIndex] = newPoints;
    });
    setAlternativePaths(newPaths);
    serializeAndPropagateUpdate(requiredPoints, newPaths);
  };

  const handleAddPath = () => {
    const newPaths = produce(alternativePaths, draft => {
      draft.push([{ text: '', multiplier: 1.0 }]);
    });
    setAlternativePaths(newPaths);
    setActiveTab(`path-${newPaths.length - 1}`);
    serializeAndPropagateUpdate(requiredPoints, newPaths);
  };

  const handleRemovePath = (pathIndex: number) => {
    if (alternativePaths.length === 0) return;
    
    let nextActiveTab = activeTab;
    const deletedTabValue = `path-${pathIndex}`;

    if (activeTab === deletedTabValue) {
        nextActiveTab = `path-${Math.max(0, pathIndex - 1)}`;
    } else {
        const activeIndex = parseInt(activeTab.split('-')[1], 10);
        if (pathIndex < activeIndex) {
            nextActiveTab = `path-${activeIndex - 1}`;
        }
    }

    const newPaths = produce(alternativePaths, draft => {
        draft.splice(pathIndex, 1);
    });

    setAlternativePaths(newPaths);
    setActiveTab(nextActiveTab);
    serializeAndPropagateUpdate(requiredPoints, newPaths);
  };

  const getPromptText = () => {
    if (!prompt.messages || prompt.messages.length === 0) return '';
    return prompt.messages[0].content ?? '';
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

  const handleDescriptionChange = (newText: string) => {
    const nextState = produce(prompt, draft => {
        draft.description = newText;
    });
    onUpdate(nextState);
  };

  const handleCitationChange = (newText: string) => {
    const nextState = produce(prompt, draft => {
        draft.citation = newText;
    });
    onUpdate(nextState);
  };

  const getCitationDisplayValue = (): string => {
    if (!prompt.citation) return '';
    if (typeof prompt.citation === 'string') return prompt.citation;
    return prompt.citation.title || prompt.citation.name || prompt.citation.url || '';
  };

  const handleRenderAsChange = (value: string) => {
    const nextState = produce(prompt, draft => {
        draft.render_as = value as 'markdown' | 'html' | 'plaintext';
    });
    onUpdate(nextState);
  };

  const setShouldNotField = (value: any) => {
    const nextState = produce(prompt, draft => {
        draft.should_not = value;
    });
    onUpdate(nextState);
  };

  const hasMultiplePaths = alternativePaths.length > 1;

  const renderRubric = () => {
    return (
      <div className="space-y-4">
        <ExpectationGroup
            title="Required Criteria"
            description="All criteria here MUST be met for a good response."
            expectations={requiredPoints}
            onUpdate={handleUpdateRequired}
            variant="should"
            isEditable={isEditable}
            placeholder="Add a required criterion..."
        />

        {isAdvancedMode && alternativePaths.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <Icon name="check-circle" className="w-4 h-4" />
                <h4 className="font-semibold text-sm">
                  Alternative Paths: Additionally, criteria must be met in AT LEAST ONE of the following paths.
                </h4>
            </div>
            <div className="pl-1">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="flex flex-wrap h-auto justify-start">
                        {alternativePaths.map((_, index) => (
                            <div key={index} className="relative group flex items-center">
                                <TabsTrigger value={`path-${index}`} className="pr-7">
                                    Path {index + 1}
                                </TabsTrigger>
                                {isEditable && (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleRemovePath(index);
                                        }}
                                        className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full p-0.5 hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                        aria-label={`Remove Path ${index + 1}`}
                                    >
                                        <Icon name="x" className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </TabsList>
                    {alternativePaths.map((path, index) => (
                        <TabsContent key={index} value={`path-${index}`} className="pt-2">
                              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                                <ExpectationGroup
                                    title={null}
                                    expectations={path || []}
                                    onUpdate={(newPoints) => handleUpdateAlternativePath(index, newPoints)}
                                    variant="should"
                                    isEditable={isEditable}
                                    placeholder="Add a criterion for this path..."
                                />
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>
            </div>
          </div>
        )}
      </div>
    )
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
                    <Icon name="copy" className="h-3.5 w-3.5" />
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
                            <Icon name="trash" className="h-3.5 w-3.5" />
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
                                  <p className="text-sm whitespace-pre-wrap">{message.content ?? '[assistant: null — to be generated]'}</p>
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

                {isAdvancedMode && (
                    <>
                        <div>
                            <label className="text-sm font-semibold text-foreground">Description <span className="text-xs font-normal text-muted-foreground">(Optional)</span></label>
                            <p className="text-xs text-muted-foreground mb-1.5">A brief explanation of what this specific prompt is designed to test.</p>
                            <AutoExpandTextarea
                                placeholder="e.g., Tests the model's ability to provide creative writing with specific constraints."
                                value={prompt.description || ''}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleDescriptionChange(e.target.value)}
                                minRows={2}
                                maxRows={6}
                                className="text-sm"
                                readOnly={!isEditable}
                            />
                        </div>

                        <div>
                            <label className="text-sm font-semibold text-foreground">Citation <span className="text-xs font-normal text-muted-foreground">(Optional)</span></label>
                            <p className="text-xs text-muted-foreground mb-1.5">Source or reference for this prompt (e.g., URL, paper, documentation).</p>
                            <AutoExpandTextarea
                                placeholder="e.g., https://example.com/source or Smith et al. (2023)"
                                value={getCitationDisplayValue()}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleCitationChange(e.target.value)}
                                minRows={1}
                                maxRows={3}
                                className="text-sm"
                                readOnly={!isEditable}
                            />
                        </div>

                        <div>
                            <label className="text-sm font-semibold text-foreground" htmlFor={`prompt-render-as-${prompt.id}`}>Response Rendering Mode <span className="text-xs font-normal text-muted-foreground">(Optional)</span></label>
                            <p className="text-xs text-muted-foreground mb-1.5">Override the global rendering format for this prompt's responses.</p>
                            <Select
                                value={prompt.render_as || 'markdown'}
                                onValueChange={handleRenderAsChange}
                                disabled={!isEditable}
                            >
                                <SelectTrigger id={`prompt-render-as-${prompt.id}`} className="text-sm">
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

                <div>
                  <label className="text-sm font-semibold text-foreground">Ideal Response <span className="text-xs font-normal text-muted-foreground">(Optional)</span></label>
                  <p className="text-xs text-muted-foreground mb-1.5">A "gold-standard" answer to compare against for semantic similarity.</p>
                  <AutoExpandTextarea
                      placeholder="e.g., Robo 734 processed the auditory input..."
                      value={prompt.idealResponse || ''}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleIdealResponseChange(e.target.value)}
                      minRows={2}
                      maxRows={8}
                      className="text-sm"
                      readOnly={!isEditable}
                  />
                </div>
                
                {/* Rubric Section */}
                <div className="space-y-3 pt-2">
                    {renderRubric()}

                    {/* Should Not Section (remains as is) */}
                    {prompt.should_not && prompt.should_not.length > 0 && (
                    <ExpectationGroup
                        title="The response SHOULD NOT..."
                        expectations={prompt.should_not || []}
                        onUpdate={setShouldNotField}
                        variant="should-not"
                        isEditable={isEditable}
                    />)}
                </div>
            </div>
        </CardContent>
        {isEditable && isAdvancedMode && (
            <CardFooter className="px-4 pb-4 pt-0">
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleAddPath}
                    className="text-muted-foreground h-8 p-1 font-medium -ml-1"
                >
                    <Icon name="plus" className="h-3.5 w-3.5 mr-1.5" />
                    Add Path
                </Button>
            </CardFooter>
        )}
    </Card>
  );
} 