'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import dynamic from 'next/dynamic';

const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2), { ssr: false });
const Github = dynamic(() => import('lucide-react').then(mod => mod.Github), { ssr: false });

interface AnonymousRunModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRun: () => void;
  onLogin: () => void;
  isSubmitting: boolean;
}

export function AnonymousRunModal({ isOpen, onClose, onRun, onLogin, isSubmitting }: AnonymousRunModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Quick Evaluation</DialogTitle>
           <DialogDescription>
            You are running a quick evaluation as an anonymous user.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4 text-sm text-muted-foreground">
            <p>Your blueprint will be tested against a single, fast model for a quick preview.</p>
            <ul className="list-disc pl-5 space-y-2">
                <li><span className="font-semibold text-foreground">Model:</span> Runs on a fast, lightweight model.</li>
                <li><span className="font-semibold text-foreground">Analysis:</span> Basic pass/fail scoring.</li>
            </ul>
            <p>
                For multi-model comparisons, advanced analysis, and to save your work, please log in with GitHub.
            </p>
        </div>
        <DialogFooter className="sm:justify-between gap-2 flex-wrap">
           <Button onClick={onLogin} variant="outline" className="w-full sm:w-auto" disabled={isSubmitting}>
                <Github className="w-4 h-4 mr-2" />
                Login for Full Features
            </Button>
            <div className="flex gap-2 justify-end w-full sm:w-auto">
                 <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                </Button>
                <Button
                    onClick={onRun}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
                    ) : (
                    'Run Quick Evaluation'
                    )}
                </Button>
            </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 