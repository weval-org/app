'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import dynamic from 'next/dynamic';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));
const TriangleAlert = dynamic(() => import('lucide-react').then(mod => mod.TriangleAlert));
const Sparkles = dynamic(() => import('lucide-react').then(mod => mod.Sparkles));

interface AutoExtendModalProps {
  onConfirm: (guidance: string) => void;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  isSubmitting: boolean;
}

export function AutoExtendModal({ onConfirm, isOpen, onOpenChange, isSubmitting }: AutoExtendModalProps) {
    const [guidance, setGuidance] = useState('');
    const { toast } = useToast();

    const handleConfirm = () => {
        if (!guidance.trim()) {
            toast({ variant: 'destructive', title: 'Guidance is empty', description: 'Please describe how you want to extend the blueprint.' });
            return;
        }
        onConfirm(guidance);
    };
    
    // Clear guidance when modal is closed (but only if not submitting)
    if (!isOpen && guidance && !isSubmitting) {
        setGuidance('');
    }

    return (
        <Dialog open={isOpen} onOpenChange={!isSubmitting ? onOpenChange : undefined}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Auto-Extending Blueprint
                            </>
                        ) : (
                            'Auto-Extend Blueprint'
                        )}
                    </DialogTitle>
                    <DialogDescription>
                        {isSubmitting 
                            ? 'AI is analyzing your blueprint and adding new content. This may take a moment.'
                            : 'Provide guidance on how to add to the existing blueprint. The AI will attempt to only add new prompts or new criteria to existing prompts.'
                        }
                    </DialogDescription>
                </DialogHeader>
                
                {!isSubmitting ? (
                    <>
                        <Alert>
                            <TriangleAlert className="h-4 w-4" />
                            <AlertTitle>Warning: Experimental Feature</AlertTitle>
                            <AlertDescription>
                                While the AI is instructed to only make additive changes, it can sometimes make mistakes. It's recommended to back up your YAML content before proceeding.
                            </AlertDescription>
                        </Alert>
                        <div className="pt-2">
                            <Label htmlFor="guidance-textarea" className="mb-2 block">Your guidance:</Label>
                            <Textarea
                                id="guidance-textarea"
                                placeholder="e.g., 'Add a new prompt that tests knowledge of the different types of logical fallacies.' or 'Add more criteria to the Stoicism prompt to check for mentions of specific philosophers like Seneca or Marcus Aurelius.'"
                                value={guidance}
                                onChange={(e) => setGuidance(e.target.value)}
                                className="min-h-[150px] text-base"
                            />
                        </div>
                    </>
                ) : (
                    <div className="py-8 flex flex-col items-center justify-center gap-4 text-center">
                        <Loader2 className="w-12 h-12 animate-spin text-primary" />
                        <div>
                            <p className="text-lg font-semibold mb-2">Extending your blueprint...</p>
                            <p className="text-sm text-muted-foreground">
                                The AI is analyzing your existing blueprint and generating new content based on your guidance.
                            </p>
                        </div>
                    </div>
                )}
                
                <DialogFooter>
                    {!isSubmitting ? (
                        <>
                            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                                Cancel
                            </Button>
                            <Button type="button" onClick={handleConfirm} className="w-32">
                                <Sparkles className="w-4 h-4 mr-2" />
                                Extend
                            </Button>
                        </>
                    ) : (
                        <Button type="button" variant="secondary" disabled>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Extending...
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 