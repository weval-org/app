'use client';

import { Button } from '@/components/ui/button';
import { AutoExpandTextarea } from '@/components/ui/textarea';
import dynamic from 'next/dynamic';
import { PointDefinition } from '@/cli/types/cli_types';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

const Trash2 = dynamic(() => import('lucide-react').then(mod => mod.Trash2));

interface ExpectationEditorProps {
  expectation: PointDefinition;
  onUpdate: (updated: PointDefinition) => void;
  onRemove: () => void;
  variant: 'should' | 'should-not';
  isEditable: boolean;
  placeholder?: string;
}

const debouncedUpdate = (onUpdate: (updated: PointDefinition) => void, updated: PointDefinition) => {
  onUpdate(updated);
};

export function ExpectationEditor({ expectation, onUpdate, onRemove, variant, isEditable, placeholder }: ExpectationEditorProps) {
  const [innerValue, setInnerValue] = useState(expectation);
  const debouncedOnUpdate = useDebouncedCallback(onUpdate, 300);

  const value = typeof expectation === 'object' && expectation !== null && 'text' in expectation ? expectation.text : '';

  const handleUpdate = (newValue: string) => {
    const updatedExp: PointDefinition = typeof expectation === 'object' && expectation !== null
      ? { ...expectation, text: newValue }
      : { text: newValue, multiplier: 1.0 };
    debouncedOnUpdate(updatedExp);
  };

  return (
    <div className="flex items-start gap-2">
      <AutoExpandTextarea
        placeholder={placeholder || 'e.g., is empathetic and understanding'}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleUpdate(e.target.value)}
        minRows={1}
        maxRows={4}
        className="text-sm py-1.5"
        readOnly={!isEditable}
      />
      {isEditable && (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" title="Remove Criterion" aria-label="Remove criterion">
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                <DropdownMenuLabel>Are you sure?</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onRemove} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                    Yes, delete criterion
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
} 