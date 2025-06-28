'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import dynamic from 'next/dynamic';
import { Prompt } from './types';
import { ExpectationGroup } from './ExpectationGroup';

const Trash2 = dynamic(() => import('lucide-react').then(mod => mod.Trash2));

interface PromptCardProps {
  prompt: Prompt;
  onUpdate: (p: Prompt) => void;
  onRemove: () => void;
}

export function PromptCard({ prompt, onUpdate, onRemove }: PromptCardProps) {
  const setField = (field: keyof Prompt, value: any) => {
    onUpdate({ ...prompt, [field]: value });
  };

  return (
    <Card className="relative p-6 sm:p-8" id={prompt.id}>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="absolute top-2 right-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8"
        title="Remove Prompt"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <div className="space-y-6">
        <div>
          <label className="text-base font-semibold text-foreground">Prompt</label>
          <p className="text-sm text-muted-foreground mb-2">The exact question or instruction for the AI. Be specific.</p>
          <Textarea
            placeholder="e.g., Write a short story about a robot who discovers music."
            value={prompt.prompt}
            onChange={e => setField('prompt', e.target.value)}
            className="min-h-[100px] text-base blueprint-input"
          />
        </div>
        <div>
          <label className="text-base font-semibold text-foreground">Ideal Response <span className="text-sm font-normal text-muted-foreground">(Optional)</span></label>
          <p className="text-sm text-muted-foreground mb-2">A "gold-standard" answer to compare against for semantic similarity.</p>
          <Textarea
            placeholder="e.g., Unit 734 processed the auditory input..."
            value={prompt.ideal}
            onChange={e => setField('ideal', e.target.value)}
            className="min-h-[100px] text-base blueprint-input"
          />
        </div>
        <div className="space-y-4">
          <ExpectationGroup
            title="The response SHOULD..."
            expectations={prompt.should}
            onUpdate={exps => setField('should', exps)}
            variant="should"
          />
          <ExpectationGroup
            title="The response SHOULD NOT..."
            expectations={prompt.should_not}
            onUpdate={exps => setField('should_not', exps)}
            variant="should-not"
          />
        </div>
      </div>
    </Card>
  );
} 