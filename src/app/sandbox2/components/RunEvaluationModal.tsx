'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ModelSelector } from './ModelSelector';
import dynamic from 'next/dynamic';

const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2), { ssr: false });

const AVAILABLE_PLAYGROUND_MODELS = [
  "openai:gpt-4o-mini",
  "anthropic:claude-3-haiku-20240307",
  "openrouter:google/gemini-flash-1.5",
  "openrouter:mistralai/mistral-7b-instruct-v0.3",
  "openrouter:meta-llama/llama-3-8b-instruct",
];

const DEFAULT_PLAYGROUND_MODELS = [
  "openai:gpt-4o-mini",
  "anthropic:claude-3-haiku-20240307",
];

const MAX_MODEL_SELECTION = 4;

interface RunEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: (selectedModels: string[]) => void;
  isSubmitting: boolean;
}

export function RunEvaluationModal({ isOpen, onClose, onRun, isSubmitting }: RunEvaluationModalProps) {
  const [selectedModels, setSelectedModels] = useState<string[]>(DEFAULT_PLAYGROUND_MODELS);

  const handleRunClick = () => {
    if (selectedModels.length > 0) {
      onRun(selectedModels);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Configure Evaluation Run</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <ModelSelector
            selectedModels={selectedModels}
            availableModels={AVAILABLE_PLAYGROUND_MODELS}
            onSelectionChange={setSelectedModels}
            maxSelection={MAX_MODEL_SELECTION}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleRunClick}
            disabled={isSubmitting || selectedModels.length === 0}
          >
            {isSubmitting ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
            ) : (
              `Run with ${selectedModels.length} model(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 