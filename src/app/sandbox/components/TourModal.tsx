'use client';

import { useState, useEffect, ReactNode, ComponentType, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';

export interface TourStep {
    title: string;
    content: ReactNode;
}

const getTourSteps = (isLoggedIn: boolean): TourStep[] => {
    const steps: TourStep[] = [
        {
          title: 'File Navigator',
          content: (
            <>
                <p className="mb-2">
                    On the far left of the page, this is where you manage your blueprint files. All your files, whether stored locally in your browser (scratchpad) or synced with GitHub, appear here.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs">
                    <li><span className="font-semibold">Local files</span> are stored only in your browser.</li>
                    <li><span className="font-semibold">GitHub files</span> are synced with your personal fork of our blueprints repository.</li>
                    <li>Use the <span className="font-mono text-xs bg-muted p-1 rounded">AI Assistant ('auto-create')</span> to generate a new blueprint from a simple description.</li>
                </ul>
            </>
          ),
        },
    ];

    if (!isLoggedIn) {
        steps.push({
            title: 'Connect to GitHub',
            content: (
                <>
                    <p className="mb-2">
                        Connect your GitHub account to unlock the full power of the Sandbox. When you log in, we'll create a personal fork of our public blueprint repository for you in your github account.
                    </p>
                    <p>This allows you to:</p>
                    <ul className="list-disc pl-5 space-y-1 mt-2 text-xs">
                        <li>Save your blueprints securely to your own repository.</li>
                        <li>Keep your work synced across devices.</li>
                        <li>Propose your best blueprints for inclusion in the public library. This will automatically be done by creating a 'Pull Request' on the Github platform. You may need to visit the PR itself in order to attend to any comments or change-suggestions made by the weval.org community.</li>
                    </ul>
                </>
            ),
        });
    }

    steps.push(
        {
            title: 'Blueprint Editor',
            content: (
                <>
                    <p className="mb-2">
                        This is your creation space, with two synchronized views for building blueprints:
                    </p>
                    <ul className="list-disc pl-5 space-y-2 text-xs">
                        <li>
                            <span className="font-semibold">LEFT SIDE: Form Panel:</span> A user-friendly, guided interface for building your blueprint step-by-step. Perfect for getting started.
                        </li>
                        <li>
                            <span className="font-semibold">RIGHT SIDE: YAML Panel:</span> For advanced users, this panel gives you direct access to the raw source code. Any comments or custom formatting you add here will be preserved. Behind the scenes, Weval uses this YAML file as the 'ground truth' specification for your eval.
                        </li>
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                        Changes in one panel are instantly reflected in the other.
                    </p>
                </>
            ),
        },
        {
            title: 'Run Evaluation',
            content: (
                 <>
                    <p className="mb-2">
                        Once your blueprint is ready, it's time to test it. Clicking 'Run Evaluation' will execute your blueprint against a suite of state-of-the-art language models.
                    </p>
                    <p className="text-xs">
                        A modal will appear showing the real-time progress of the run. Once complete, you'll be linked to a detailed analysis page comparing the performance of each model.
                    </p>
                </>
            ),
        },
        {
            title: 'View History',
            content: (
                <>
                    <p className="mb-2">
                        The Runs Sidebar on the far right, accessible by the clock-like icon in the navigation header, provides a complete history of all evaluations you've run for the currently active blueprint.
                    </p>
                    <p className="text-xs">
                        NOTE: Any results from your sandbox will only last one week before deletion. If you want your blueprint evaluation results to become a permanent installation on Weval.org, you'll need to go through the 'Proposal' process.
                    </p>
                </>
            ),
        }
    );

    if (isLoggedIn) {
         steps.push({
            title: 'Propose to Library',
            content: (
                <>
                    <p className="mb-2">
                        Have you created a high-quality blueprint that could benefit the community? You can propose to add it to our public library!
                    </p>
                    <p className="text-xs">
                        This button (at the top-right of the screen) will open a wizard to guide you through creating a Pull Request. If accepted, your blueprint will be available for everyone to see and use.
                    </p>
                </>
            ),
        });
    }

    return steps;
};

interface TourModalProps {
    isOpen: boolean;
    onClose: () => void;
    isLoggedIn: boolean;
    ChevronLeftIcon: ComponentType<{ className?: string }>;
    ChevronRightIcon: ComponentType<{ className?: string }>;
}

export function TourModal({ isOpen, onClose, isLoggedIn, ChevronLeftIcon, ChevronRightIcon }: TourModalProps) {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);

    const steps = getTourSteps(isLoggedIn);

    useEffect(() => {
        if (isOpen) {
            setCurrentStepIndex(0);
        }
    }, [isOpen]);

    const goToNext = useCallback(() => {
        if (currentStepIndex < steps.length - 1) {
            setCurrentStepIndex(currentStepIndex + 1);
        } else {
            onClose();
        }
    }, [currentStepIndex, steps.length, onClose]);

    const goToPrev = useCallback(() => {
        if (currentStepIndex > 0) {
            setCurrentStepIndex(currentStepIndex - 1);
        }
    }, [currentStepIndex]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'ArrowRight') {
                goToNext();
            } else if (event.key === 'ArrowLeft') {
                goToPrev();
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, goToNext, goToPrev]);

    if (!steps || steps.length === 0) {
        return null;
    }

    const currentStep = steps[currentStepIndex];

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>{`Step ${currentStepIndex + 1}: ${currentStep.title}`}</DialogTitle>
                </DialogHeader>
                <div className="py-4 text-sm text-muted-foreground">
                    {currentStep.content}
                </div>
                <DialogFooter className="flex flex-row justify-between items-center w-full">
                    <div className="text-xs text-muted-foreground">
                        {currentStepIndex + 1} / {steps.length}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={goToPrev} disabled={currentStepIndex === 0}>
                            <ChevronLeftIcon className="h-4 w-4 mr-1" />
                            Previous
                        </Button>
                        <Button size="sm" onClick={goToNext}>
                            {currentStepIndex === steps.length - 1 ? 'Finish' : 'Next'}
                            {currentStepIndex < steps.length - 1 && <ChevronRightIcon className="h-4 w-4 ml-1" />}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 