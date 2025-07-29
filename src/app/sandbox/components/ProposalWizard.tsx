'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Icon from '@/components/ui/icon';

type Step = 'intro' | 'form' | 'processing' | 'success' | 'error';

interface ProposalWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; body: string }) => Promise<string | null>;
  blueprintName: string;
  isSubmitting?: boolean;
}

export function ProposalWizard({
  isOpen,
  onClose,
  onSubmit,
  blueprintName,
}: ProposalWizardProps) {
  const [step, setStep] = useState<Step>('intro');
  const [title, setTitle] = useState(`feat(blueprints): Add ${blueprintName}`);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  const resetAndClose = () => {
    onClose();
    // Delay reset to allow for closing animation
    setTimeout(() => {
      setStep('intro');
      setTitle(`feat(blueprints): Add ${blueprintName}`);
      setBody('');
      setError(null);
      setPrUrl(null);
    }, 300);
  };

  const handleNext = () => {
    if (step === 'intro') setStep('form');
  };

  const handleSubmit = async () => {
    setStep('processing');
    try {
      const resultingPrUrl = await onSubmit({ title, body });
      if (resultingPrUrl) {
        setPrUrl(resultingPrUrl);
        setStep('success');
      } else {
        throw new Error('Submission failed. The proposal could not be created.');
      }
    } catch (e: any) {
      setError(e.message || 'An unknown error occurred.');
      setStep('error');
    }
  };

  const renderIntroStep = () => (
    <>
      <DialogHeader>
        <DialogTitle>Share Your Blueprint</DialogTitle>
        <DialogDescription>
          You're about to propose <strong>{blueprintName}</strong> for inclusion in the public library. This will create a pull request on GitHub, making it visible for discussion and review by maintainers and the community.
          <br /><br />
          Once proposed, this blueprint will be locked in the Sandbox to prevent changes while it's under review. You can still make a copy if you wish to continue iterating.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={resetAndClose}>Cancel</Button>
        <Button onClick={handleNext}>Continue</Button>
      </DialogFooter>
    </>
  );

  const renderFormStep = () => (
    <>
      <DialogHeader>
        <DialogTitle>Describe Your Contribution</DialogTitle>
        <DialogDescription>
          Help reviewers understand your blueprint by providing a clear title and summary.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <label htmlFor="pr-title" className="text-sm font-medium">Proposal Title</label>
          <Input id="pr-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label htmlFor="pr-body" className="text-sm font-medium">Summary</label>
          <Textarea
            id="pr-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g., This blueprint tests a model's ability to identify logical fallacies in arguments."
            rows={5}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setStep('intro')}>Back</Button>
        <Button onClick={handleSubmit} disabled={!title || !body}>Submit Proposal</Button>
      </DialogFooter>
    </>
  );

  const renderProcessingStep = () => (
    <div className="flex flex-col items-center justify-center text-center py-8">
      <Icon name="loader-2" className="w-12 h-12 text-primary animate-spin mb-4" />
      <h3 className="text-lg font-semibold">Submitting Your Proposal...</h3>
      <p className="text-muted-foreground mt-2">
        Please wait while we prepare and send your contribution for review.
      </p>
    </div>
  );

  const renderSuccessStep = () => (
    <div className="flex flex-col items-center justify-center text-center py-8">
      <Icon name="check-circle" className="w-12 h-12 text-green-500 mb-4" />
      <h3 className="text-lg font-semibold">Proposal Submitted!</h3>
      <p className="text-muted-foreground mt-2">
        You can track the review status via the icon next to the file name in your blueprint list.
      </p>
      <div className="mt-4 text-sm text-left bg-muted p-4 rounded-lg">
        <h4 className="font-semibold mb-2">What's Next?</h4>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>Keep an eye on the discussion on GitHub.</li>
            <li>Maintainers may request changes or provide feedback.</li>
            <li>Once approved, your blueprint will be merged!</li>
        </ul>
      </div>
      <div className="flex gap-4 mt-6">
        <Button variant="outline" onClick={resetAndClose}>Done</Button>
        {prUrl && (
            <Button asChild>
                <a href={prUrl} target="_blank" rel="noopener noreferrer">
                    <Icon name="git-pull-request" className="w-4 h-4 mr-2" />
                    View on GitHub
                </a>
            </Button>
        )}
      </div>
    </div>
  );
  
  const renderErrorStep = () => (
     <div className="flex flex-col items-center justify-center text-center py-8">
        <DialogHeader>
          <DialogTitle>Submission Failed</DialogTitle>
        </DialogHeader>
        <p className="text-destructive mt-4">{error}</p>
        <DialogFooter className="mt-6">
            <Button variant="outline" onClick={resetAndClose}>Close</Button>
        </DialogFooter>
    </div>
  );


  const renderContent = () => {
    switch (step) {
      case 'intro': return renderIntroStep();
      case 'form': return renderFormStep();
      case 'processing': return renderProcessingStep();
      case 'success': return renderSuccessStep();
      case 'error': return renderErrorStep();
      default: return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && resetAndClose()}>
      <DialogContent>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
} 