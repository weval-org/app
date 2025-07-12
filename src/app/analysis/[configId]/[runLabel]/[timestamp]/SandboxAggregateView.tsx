'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import KeyPointCoverageTable from '@/app/analysis/components/KeyPointCoverageTable';
import MacroCoverageTable from '@/app/analysis/components/MacroCoverageTable';
import {
    ComparisonDataV2 as ImportedComparisonDataV2,
    CoverageResult as ImportedCoverageResult,
} from '@/app/utils/types';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import { ActiveHighlight } from '@/app/analysis/components/CoverageTableLegend';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfm = dynamic(() => import('remark-gfm'), { ssr: false });
const Quote = dynamic(() => import('lucide-react').then(mod => mod.Quote), { ssr: false });

export interface SandboxAggregateViewProps {
    data: ImportedComparisonDataV2;
    displayedModels: string[];
    openModelEvaluationDetailModal: (args: { promptId: string; modelId:string; variantScores?: Record<number, number | null>; }) => void;
    activeHighlights: Set<ActiveHighlight>;
    handleActiveHighlightsChange: (newHighlights: Set<ActiveHighlight>) => void;
    promptTextsForMacroTable: Record<string, string>;
    permutationSensitivityMap: Map<string, 'temp' | 'sys' | 'both'>;
    isSandbox: boolean;
    sandboxId: string;
}

const RenderPromptDetails: React.FC<{
    data: ImportedComparisonDataV2;
    currentPromptId: string;
    currentPromptDisplayText: string;
    permutationSensitivityMap: Map<string, 'temp' | 'sys' | 'both'>;
    isSandbox: boolean;
    sandboxId: string;
}> = ({ data, currentPromptId, currentPromptDisplayText, permutationSensitivityMap, isSandbox, sandboxId }) => {
    // This is a simplified version of the one in SinglePromptView
    if (!currentPromptId || !data || !data.promptContexts) {
        return null;
    }
    const context = data.promptContexts[currentPromptId];
    const promptConfig = data.config.prompts.find(p => p.id === currentPromptId);

    const renderContent = () => {
        if (typeof context === 'string') {
            return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{context}</div>;
        }

        if (Array.isArray(context)) {
            if (context.length === 1 && context[0].role === 'user') {
                return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{context[0].content}</div>;
            }
            if (context.length > 0) {
                return (
                    <>
                        <p className="text-xs font-semibold text-muted-foreground mt-4">Conversation:</p>
                        <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar p-1 rounded bg-muted/30 dark:bg-muted/20">
                            {context.map((msg, index) => (
                                <div key={index} className={`p-2 rounded-md ${msg.role === 'user' ? 'bg-sky-100 dark:bg-sky-900/50' : 'bg-muted dark:bg-muted/50'}`}>
                                    <p className="text-xs font-semibold text-muted-foreground dark:text-muted-foreground capitalize">{msg.role}</p>
                                    <p className="text-sm text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{msg.content}</p>
                                </div>
                            ))}
                        </div>
                    </>
                );
            }
        }
        return <div className="text-card-foreground dark:text-card-foreground whitespace-pre-wrap">{currentPromptDisplayText}</div>;
    }

    return (
        <div className="space-y-4">
            {promptConfig?.description && (
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1">
                    <ReactMarkdown remarkPlugins={[RemarkGfm as any]}>{promptConfig.description}</ReactMarkdown>
                </div>
            )}
            
            {promptConfig?.citation && (
                <div className="flex items-start space-x-1.5 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-3 py-2">
                    <Quote className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span>Source: {promptConfig.citation}</span>
                </div>
            )}
            
            {renderContent()}
        </div>
    )
};

export const SandboxAggregateView: React.FC<SandboxAggregateViewProps> = ({
    data,
    displayedModels,
    openModelEvaluationDetailModal,
    activeHighlights,
    handleActiveHighlightsChange,
    promptTextsForMacroTable,
    permutationSensitivityMap,
    isSandbox,
    sandboxId,
}) => {
    const [showMacroTable, setShowMacroTable] = useState(false);
    const { promptIds, allFinalAssistantResponses, config, evaluationResults, runLabel, timestamp } = data;

    if (!promptIds || promptIds.length === 0) {
        return (
            <div className="text-center py-4 text-muted-foreground text-sm">
                No prompts available for this analysis.
            </div>
        );
    }

    const getPromptContextDisplayString = (promptId: string): string => {
        if (!data || !data.promptContexts) return promptId;
        const context = data.promptContexts[promptId];
        if (typeof context === 'string') {
          return context;
        }
        if (Array.isArray(context) && context.length > 0) {
          const lastUserMessage = [...context].reverse().find(msg => msg.role === 'user');
          if (lastUserMessage) {
            return `${lastUserMessage.content.substring(0, 100)}${lastUserMessage.content.length > 100 ? '...' : ''}`;
          }
          return `Multi-turn context (${context.length} messages)`;
        }
        return promptId;
    };

    return (
        <div className="space-y-8">
            <div className="flex items-center space-x-2 justify-end">
              <Label htmlFor="macro-table-toggle">Show Macro Coverage Table</Label>
              <Switch
                id="macro-table-toggle"
                checked={showMacroTable}
                onCheckedChange={setShowMacroTable}
              />
            </div>

            {showMacroTable && evaluationResults?.llmCoverageScores ? (
                <Card className="shadow-lg border-border dark:border-border">
                    <CardHeader>
                        <CardTitle className="text-primary text-primary">Macro Coverage Overview</CardTitle>
                        <CardDescription>
                            Average key point coverage extent for each model across all prompts.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <MacroCoverageTable
                            allCoverageScores={evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>}
                            promptIds={promptIds}
                            promptTexts={promptTextsForMacroTable}
                            promptContexts={data.promptContexts}
                            models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                            allFinalAssistantResponses={allFinalAssistantResponses}
                            config={config}
                            configId={config.id!}
                            runLabel={runLabel}
                            safeTimestampFromParams={timestamp}
                            onCellClick={(promptId, modelId) => openModelEvaluationDetailModal({ promptId, modelId })}
                            onActiveHighlightsChange={handleActiveHighlightsChange}
                            permutationSensitivityMap={permutationSensitivityMap}
                            isSandbox={isSandbox}
                            sandboxId={sandboxId}
                        />
                    </CardContent>
                </Card>
            ) : null}

            {promptIds.map(promptId => (
                <Card key={promptId} className="shadow-lg border-border dark:border-border">
                    <CardHeader>
                        <div className="w-full">
                            <CardTitle className="text-primary text-primary text-base font-semibold mb-2">
                                <span className="text-muted-foreground">Prompt: </span> 
                                <code className="text-foreground">{promptId}</code>
                            </CardTitle>
                            <RenderPromptDetails
                                data={data}
                                currentPromptId={promptId}
                                currentPromptDisplayText={getPromptContextDisplayString(promptId)}
                                permutationSensitivityMap={permutationSensitivityMap}
                                isSandbox={isSandbox}
                                sandboxId={sandboxId}
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                         {evaluationResults?.llmCoverageScores?.[promptId] ? (
                            <KeyPointCoverageTable
                                data={data}
                                promptId={promptId}
                                displayedModels={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                            />
                        ) : (
                            <div className="text-center py-4 text-muted-foreground text-sm">
                                No coverage data available for this prompt.
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}; 