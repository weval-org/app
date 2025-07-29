'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Icon from '@/components/ui/icon';

interface AutoCreateModalProps {
  onGenerated: (yaml: string) => void;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function AutoCreateModal({ onGenerated, isOpen, onOpenChange }: AutoCreateModalProps) {
    const [goal, setGoal] = useState('');
    const [wikiUrl, setWikiUrl] = useState('');
    const [guidance, setGuidance] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('freeform');
    const { toast } = useToast();

    const handleFreeformGenerate = async () => {
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
            
            if (data.validationError) {
                toast({
                    variant: 'destructive',
                    title: 'YAML Validation Error',
                    description: "The generated blueprint has syntax errors. It has been loaded into the editor so you can fix them manually.",
                    duration: 10000,
                });
            } else if (data.sanitized) {
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
            onOpenChange(false);
            setGoal('');
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Generation Failed', description: error.message });
        } finally {
            setIsLoading(false);
        }
    };

    const handleWikiGenerate = async () => {
        if (!wikiUrl) {
          toast({
            variant: 'destructive',
            title: 'Validation Error',
            description: 'Please enter a Wikipedia URL.',
          });
          return;
        }
    
        setIsLoading(true);
        try {
          const response = await fetch('/api/sandbox/auto-wiki', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wikiUrl, guidance }),
          });
    
          const data = await response.json();
    
          if (!response.ok) {
            throw new Error(data.error || 'Failed to generate blueprint.');
          }
    
          if (data.validationError) {
            toast({
              variant: 'destructive',
              title: 'YAML Validation Error',
              description: "The generated blueprint has syntax errors. It has been loaded into the editor so you can fix them manually.",
              duration: 10000,
            });
          } else if (data.sanitized) {
            toast({
              variant: 'default',
              title: 'Response Sanitized',
              description: "The AI's response was incomplete and has been automatically cleaned up. Please review the result carefully.",
              duration: 8000, 
              className: 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-900/50 dark:border-amber-700 dark:text-amber-100',
            });
          } else if (data.truncated) {
            toast({
              variant: 'default',
              title: 'Article Truncated',
              description: 'The Wikipedia article was very long and has been shortened. The blueprint was generated from the truncated text.',
              duration: 8000, 
              className: 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-900/50 dark:border-amber-700 dark:text-amber-100',
            });
          } else {
            toast({
              title: 'Blueprint Generated!',
              description: 'The blueprint has been generated from the Wikipedia article and loaded into the editor.',
            });
          }
    
          onGenerated(data.yaml);
          onOpenChange(false);
          setWikiUrl('');
          setGuidance('');
        } catch (error: any) {
          toast({
            variant: 'destructive',
            title: 'Generation Failed',
            description: error.message,
          });
        } finally {
          setIsLoading(false);
        }
    };

    const handleGenerate = () => {
        if (activeTab === 'freeform') {
            handleFreeformGenerate();
        } else {
            handleWikiGenerate();
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">Auto-Create Blueprint</DialogTitle>
                    <DialogDescription>
                        Generate a starting blueprint using one of the methods below.
                    </DialogDescription>
                </DialogHeader>
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="freeform" className="flex items-center gap-2">
                            <Icon name="wand" className="w-4 h-4" /> Freeform
                        </TabsTrigger>
                        <TabsTrigger value="wiki" className="flex items-center gap-2">
                            <Icon name="book-open-check" className="w-4 h-4" /> From Wikipedia
                        </TabsTrigger>
                    </TabsList>
                    <TabsContent value="freeform">
                        <div className="py-4">
                            <Label htmlFor="goal-textarea" className="mb-2 block">Describe your goal:</Label>
                            <Textarea
                                id="goal-textarea"
                                placeholder="e.g., 'Create a test that checks if a model can write a haiku about a robot.' or 'Generate a blueprint to test a model's knowledge of the GDPR.'"
                                value={goal}
                                onChange={(e) => setGoal(e.target.value)}
                                className="min-h-[150px] text-base"
                            />
                        </div>
                    </TabsContent>
                    <TabsContent value="wiki">
                        <div className="py-4 space-y-4">
                            <div>
                                <Label htmlFor="wiki-url" className="mb-2 block">Enter a Wikipedia URL:</Label>
                                <Input
                                    id="wiki-url"
                                    value={wikiUrl}
                                    onChange={(e) => setWikiUrl(e.target.value)}
                                    placeholder="https://en.wikipedia.org/wiki/Stoicism"
                                />
                            </div>
                             <div>
                                <Label htmlFor="guidance-textarea" className="mb-2 block">Optional Guidance:</Label>
                                <Textarea
                                    id="guidance-textarea"
                                    placeholder="e.g., Focus on the early life of the subject, create prompts that compare this topic to Platonism..."
                                    value={guidance}
                                    onChange={(e) => setGuidance(e.target.value)}
                                    className="min-h-[100px]"
                                />
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
                <DialogFooter>
                    <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={isLoading}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleGenerate} disabled={isLoading} className="w-32">
                        {isLoading ? <Icon name="loader-2" className="w-4 h-4 animate-spin" /> : 'Generate'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 