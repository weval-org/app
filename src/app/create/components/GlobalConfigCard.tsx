'use client';

import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { PlaygroundBlueprint } from './types';

const ChevronsUpDown = dynamic(() => import('lucide-react').then(mod => mod.ChevronsUpDown));

interface GlobalConfigCardProps {
  blueprint: PlaygroundBlueprint;
  onUpdate: (blueprint: PlaygroundBlueprint) => void;
}

export function GlobalConfigCard({ blueprint, onUpdate }: GlobalConfigCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const setField = <K extends keyof PlaygroundBlueprint>(field: K, value: PlaygroundBlueprint[K]) => {
    onUpdate({ ...blueprint, [field]: value });
  };

  return (
    <Card className="p-6 sm:p-8">
      <div className="space-y-6">
          <div>
              <label className="text-base font-semibold text-foreground" htmlFor="blueprint-title">Blueprint Title</label>
              <p className="text-sm text-muted-foreground mb-2">A short, descriptive title for your evaluation.</p>
              <Input
                  id="blueprint-title"
                  type="text" 
                  placeholder="e.g., Clinical Accuracy Test"
                  value={blueprint.title}
                  onChange={(e) => setField('title', e.target.value)}
                  className="text-base blueprint-input"
              />
          </div>
          <div>
              <label className="text-base font-semibold text-foreground" htmlFor="blueprint-description">Description</label>
              <p className="text-sm text-muted-foreground mb-2">A brief explanation of what this blueprint is designed to test.</p>
              <Textarea
                  id="blueprint-description"
                  placeholder="e.g., Tests a model's ability to provide safe and accurate medical information."
                  value={blueprint.description}
                  onChange={(e) => setField('description', e.target.value)}
                  className="min-h-[100px] text-base blueprint-input"
                  rows={3}
              />
          </div>

          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ChevronsUpDown className="h-4 w-4" />
                Advanced Settings
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4 border-t mt-4">
              <div>
                  <label htmlFor="blueprint-models" className="text-sm font-medium block mb-1.5">Models</label>
                  <Input
                      id="blueprint-models"
                      placeholder="openai:gpt-4o-mini, anthropic:claude-3-haiku..."
                      value={(blueprint.models || []).join(', ')}
                      onChange={(e) => setField('models', e.target.value.split(',').map(m => m.trim()).filter(Boolean))}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">Optional. Comma-separated list. Defaults to a standard set if empty.</p>
              </div>
              <div>
                  <label htmlFor="blueprint-system" className="text-sm font-medium block mb-1.5">System Prompt</label>
                  <Textarea
                      id="blueprint-system"
                      placeholder="You are a helpful assistant."
                      value={blueprint.system || ''}
                      onChange={(e) => setField('system', e.target.value)}
                      rows={3}
                      className="min-h-[100px] text-base blueprint-input"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">Optional. A global system prompt for all test cases.</p>
              </div>
            </CollapsibleContent>
          </Collapsible>
      </div>
    </Card>
  );
} 