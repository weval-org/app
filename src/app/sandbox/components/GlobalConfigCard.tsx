'use client';

import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AutoExpandTextarea } from '@/components/ui/textarea';
import { ComparisonConfig } from '@/cli/types/cli_types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import dynamic from 'next/dynamic';
// import { ModelSelector } from './ModelSelector'; // To be created

const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));

interface GlobalConfigCardProps {
  blueprint: ComparisonConfig;
  onUpdate: (bp: ComparisonConfig) => void;
  isEditable: boolean; // Controls if the form fields are interactive
}

export function GlobalConfigCard({ blueprint, onUpdate, isEditable }: GlobalConfigCardProps) {

  const handleFieldChange = <K extends keyof ComparisonConfig>(field: K, value: ComparisonConfig[K]) => {
    onUpdate({ ...blueprint, [field]: value });
  };

  return (
    <Card className="p-4">
        <div className="space-y-4">
            <div>
                <label className="text-sm font-semibold text-foreground" htmlFor="blueprint-title">Blueprint Title</label>
                <p className="text-xs text-muted-foreground mb-1.5">A short, descriptive title for your evaluation.</p>
                <Input
                    id="blueprint-title"
                    type="text" 
                    placeholder="e.g., Clinical Accuracy Test"
                    value={blueprint.title}
                    onChange={(e) => handleFieldChange('title', e.target.value)}
                    className="text-sm"
                    readOnly={!isEditable}
                />
            </div>
            <div>
                <label className="text-sm font-semibold text-foreground" htmlFor="blueprint-description">Description</label>
                <p className="text-xs text-muted-foreground mb-1.5">A brief explanation of what this blueprint is designed to test.</p>
                <AutoExpandTextarea
                    id="blueprint-description"
                    placeholder="e.g., Tests a model's ability to provide safe and accurate medical information."
                    value={blueprint.description || ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange('description', e.target.value)}
                    minRows={2}
                    maxRows={6}
                    className="text-sm"
                    readOnly={!isEditable}
                />
            </div>
            {blueprint.models && blueprint.models.length > 0 && (
                 <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Models Will Be Ignored</AlertTitle>
                    <AlertDescription>
                        Defining models in the blueprint is not supported within the sandbox. Models for evaluation are selected when you click &quot;Run Evaluation.&quot; If you want to submit this as a proposal, please remove the <code>models</code> field.
                    </AlertDescription>
                </Alert>
            )}
            {/*
            <div>
                <label className="text-base font-semibold text-foreground">Models</label>
                <p className="text-sm text-muted-foreground mb-2">The AI models you want to test.</p>
                <ModelSelector
                    selectedModels={blueprint.models || []}
                    onSelectionChange={(models) => handleFieldChange('models', models)}
                />
            </div>
            */}
            <div>
                <label htmlFor="blueprint-system" className="text-sm font-semibold block mb-1">System Prompt (Optional)</label>
                <AutoExpandTextarea
                    id="blueprint-system"
                    placeholder="You are a helpful assistant."
                    value={blueprint.system || ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange('system', e.target.value)}
                    minRows={2}
                    maxRows={6}
                    className="text-sm"
                    readOnly={!isEditable}
                />
                <p className="text-xs text-muted-foreground mt-1">A global system prompt to be used for all test cases in this blueprint.</p>
            </div>
        </div>
    </Card>
  );
} 