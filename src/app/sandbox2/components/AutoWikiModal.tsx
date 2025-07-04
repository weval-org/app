'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));
const BookOpenCheck = dynamic(() => import('lucide-react').then(mod => mod.BookOpenCheck));

interface AutoWikiModalProps {
  onGenerated: (yaml: string) => void;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function AutoWikiModal({ onGenerated, isOpen, onOpenChange }: AutoWikiModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [wikiUrl, setWikiUrl] = useState('');
  const { toast } = useToast();

  const handleGenerate = async () => {
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
      const response = await fetch('/api/sandbox2/auto-wiki', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wikiUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate blueprint.');
      }

      if (data.sanitized) {
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <BookOpenCheck className="w-6 h-6 text-primary" />
            <DialogTitle>Auto-Generate from Wikipedia</DialogTitle>
          </div>
          <DialogDescription>
            Enter a URL to a Wikipedia article. We&apos;ll analyze the content and generate a draft blueprint with potent, testable prompts for you to refine.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="wiki-url" className="text-right">
              Wiki URL
            </Label>
            <Input
              id="wiki-url"
              value={wikiUrl}
              onChange={(e) => setWikiUrl(e.target.value)}
              className="col-span-3"
              placeholder="https://en.wikipedia.org/wiki/Stoicism"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleGenerate} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate Blueprint'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 