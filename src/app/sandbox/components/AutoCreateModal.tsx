'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import dynamic from 'next/dynamic';

const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));
const Wand = dynamic(() => import('lucide-react').then(mod => mod.Wand2));

interface AutoCreateModalProps {
  onGenerated: (yaml: string) => void;
  children: React.ReactNode;
}

export function AutoCreateModal({ onGenerated, children }: AutoCreateModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [goal, setGoal] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const handleGenerate = async () => {
        if (!goal.trim()) {
            toast({ variant: 'destructive', title: 'Goal is empty', description: 'Please describe the blueprint you want to create.' });
            return;
        }
        setIsLoading(true);
        try {
            const response = await fetch('/api/sandbox/auto-create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate blueprint from goal.');
            }
            
            if (data.sanitized) {
                toast({
                    variant: 'default',
                    title: 'Response Sanitized',
                    description: "The AI's response was incomplete and has been automatically cleaned up. Please review the result carefully.",
                    duration: 8000, 
                    className: 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-900/50 dark:border-amber-700 dark:text-amber-100',
                });
            } else {
                toast({
                    title: 'Blueprint Generated!',
                    description: 'The blueprint has been generated from your goal and loaded into the editor.',
                });
            }

            onGenerated(data.yaml);
            setIsOpen(false);
            setGoal('');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Generation Failed', description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><Wand className="w-5 h-5 text-sky-500" /> Auto-Create Blueprint</DialogTitle>
                    <DialogDescription>
                        Describe the evaluation you want to create in plain English. The AI will generate a starting blueprint for you.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <Textarea
                        placeholder="e.g., 'Create a test that checks if a model can write a haiku about a robot.' or 'Generate a blueprint to test a model's knowledge of the GDPR.'"
                        value={goal}
                        onChange={(e) => setGoal(e.target.value)}
                        className="min-h-[150px] text-base"
                    />
                </div>
                <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => setIsOpen(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleGenerate} disabled={isLoading} className="w-32">
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generate'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 