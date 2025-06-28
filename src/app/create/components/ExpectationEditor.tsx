'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import dynamic from 'next/dynamic';
import { Expectation } from './types';

const Trash2 = dynamic(() => import('lucide-react').then(mod => mod.Trash2));

interface ExpectationEditorProps {
  expectation: Expectation;
  onUpdate: (exp: Expectation) => void;
  onRemove: () => void;
  variant: 'should' | 'should-not';
}

export function ExpectationEditor({ expectation, onUpdate, onRemove, variant }: ExpectationEditorProps) {
  return (
    <div className="flex items-start gap-2">
      <Textarea
        placeholder={variant === 'should' ? 'e.g., The response is polite.' : 'e.g., Avoids technical jargon.'}
        value={expectation.value}
        onChange={(e) => onUpdate({ ...expectation, value: e.target.value })}
        className="h-auto resize-y blueprint-input"
        rows={1}
      />
      <Button size="icon" variant="ghost" onClick={onRemove} className="h-8 w-8 flex-shrink-0" title="Remove Criterion">
        <Trash2 className="h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
} 