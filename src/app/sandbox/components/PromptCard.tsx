'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AutoExpandTextarea } from '@/components/ui/textarea';
import dynamic from 'next/dynamic';
import {
  ComparisonConfig,
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

const Trash2 = dynamic(() => import('lucide-react').then(mod => mod.Trash2));
const Copy = dynamic(() => import('lucide-react').then(mod => mod.Copy));

type PromptConfig = WevalPromptConfig;

interface PromptCardProps {
  prompt: PromptConfig;
  onUpdate: (p: PromptConfig) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  isEditable: boolean;
}

export function PromptCard({ prompt, onUpdate, onRemove, onDuplicate, isEditable }: PromptCardProps) {

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
    <Card className="relative p-4" id={prompt.id}>
        {isEditable && (
            <div className="absolute top-1.5 right-1.5 flex items-center">
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
            <ExpectationGroup
                title="With as much detail as possible, describe what constitutes a good response:"
                expectations={prompt.points || []}
                onUpdate={exps => setField('points', exps)}
                variant="should"
                isEditable={isEditable}
            />
            {/* 
            Temporarily commented out - users can express negative criteria using plain language 
            in the "should" section instead (e.g., "should be professional and avoid slang")
            <ExpectationGroup
                title="The response SHOULD NOT..."
                expectations={prompt.should_not || []}
                onUpdate={exps => setField('should_not', exps)}
                variant="should-not"
                isEditable={isEditable}
            />
            */}
            </div>
        </div>
    </Card>
  );
} 