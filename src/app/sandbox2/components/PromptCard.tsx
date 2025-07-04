'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import dynamic from 'next/dynamic';
import {
  ComparisonConfig,
  PromptConfig as WevalPromptConfig,
} from '@/cli/types/cli_types';
import { ExpectationGroup } from './ExpectationGroup';
import { produce } from 'immer';

const Trash2 = dynamic(() => import('lucide-react').then(mod => mod.Trash2));

type PromptConfig = WevalPromptConfig;

interface PromptCardProps {
  prompt: PromptConfig;
  onUpdate: (p: PromptConfig) => void;
  onRemove: () => void;
  isEditable: boolean;
}

export function PromptCard({ prompt, onUpdate, onRemove, isEditable }: PromptCardProps) {

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

  return (
    <Card className="relative p-6" id={prompt.id}>
        {isEditable && (
            <Button
                variant="ghost"
                size="icon"
                onClick={onRemove}
                className="absolute top-2 right-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                title="Remove Prompt"
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        )}
        <div className="space-y-6">
            <div>
            <label className="text-base font-semibold text-foreground">Prompt</label>
            <p className="text-sm text-muted-foreground mb-2">The exact question or instruction for the AI. Be specific.</p>
            
            {prompt.messages && prompt.messages.length > 1 ? (
                <div className="space-y-2 rounded-md border p-4 bg-muted/50">
                    {prompt.messages.map((message, index) => (
                        <div key={index} className="flex flex-col">
                            <span className="text-xs font-semibold capitalize text-muted-foreground">{message.role}</span>
                            <p className="text-base whitespace-pre-wrap">{message.content}</p>
                        </div>
                    ))}
                    <p className="text-xs text-center text-muted-foreground pt-2">Multi-turn prompts are currently read-only in the form view.</p>
                </div>
            ) : (
                <Textarea
                    placeholder="e.g., Write a short story about a robot who discovers music."
                    value={getPromptText()}
                    onChange={e => handlePromptTextChange(e.target.value)}
                    className="min-h-[100px] text-base"
                    readOnly={!isEditable}
                />
            )}
            </div>
            <div>
            <label className="text-base font-semibold text-foreground">Ideal Response <span className="text-sm font-normal text-muted-foreground">(Optional)</span></label>
            <p className="text-sm text-muted-foreground mb-2">A "gold-standard" answer to compare against for semantic similarity.</p>
            <Textarea
                placeholder="e.g., Unit 734 processed the auditory input..."
                value={prompt.idealResponse || ''}
                onChange={e => handleIdealResponseChange(e.target.value)}
                className="min-h-[100px] text-base"
                readOnly={!isEditable}
            />
            </div>
            <div className="space-y-4">
            <ExpectationGroup
                title="The response SHOULD..."
                expectations={prompt.points || []}
                onUpdate={exps => setField('points', exps)}
                variant="should"
                isEditable={isEditable}
            />
            <ExpectationGroup
                title="The response SHOULD NOT..."
                expectations={prompt.should_not || []}
                onUpdate={exps => setField('should_not', exps)}
                variant="should-not"
                isEditable={isEditable}
            />
            </div>
        </div>
    </Card>
  );
} 