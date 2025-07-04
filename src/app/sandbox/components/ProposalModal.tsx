'use client';

import { useState, useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/Modal';
import dynamic from 'next/dynamic';

const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2));
const GitPullRequest = dynamic(() => import('lucide-react').then(mod => mod.GitPullRequest));
const CheckCircle = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle));
const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle));
const ExternalLink = dynamic(() => import('lucide-react').then(mod => mod.ExternalLink));

type ProposalState = 'idle' | 'authenticating' | 'creating_pr' | 'success' | 'error';

interface ProposalModalProps {
    isOpen: boolean;
    onClose: () => void;
    blueprintYaml: string;
    blueprintTitle: string;
    blueprintDescription?: string;
}

export function ProposalModal({
    isOpen,
    onClose,
    blueprintYaml,
    blueprintTitle,
    blueprintDescription,
}: ProposalModalProps) {
    const [status, setStatus] = useState<ProposalState>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [pullRequestUrl, setPullRequestUrl] = useState<string>('');

    useEffect(() => {
        // Reset state when modal is opened
        if (isOpen) {
            setStatus('idle');
            setErrorMessage('');
            setPullRequestUrl('');
        }
    }, [isOpen]);

    const handleAuth = () => {
        setStatus('authenticating');
        const authPopup = window.open('/api/github/auth/request', 'githubAuth', 'width=600,height=700');

        const messageListener = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;

            if (event.data.type === 'github_auth_success') {
                handleCreatePR();
            } else if (event.data.type === 'github_auth_error') {
                setErrorMessage(event.data.message || 'Authentication failed.');
                setStatus('error');
            }
            window.removeEventListener('message', messageListener);
            authPopup?.close();
        };
        window.addEventListener('message', messageListener);
    };

    const handleCreatePR = async () => {
        setStatus('creating_pr');
        try {
            const response = await fetch('/api/github/pr/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    blueprintYaml,
                    blueprintTitle: blueprintTitle.trim() || 'Untitled Blueprint',
                    blueprintDescription: blueprintDescription?.trim(),
                }),
            });

            const result = await response.json();
            if (!response.ok) {
                // Check if the error is an auth error, if so, reset to idle to prompt re-auth
                if (response.status === 401) {
                    setStatus('idle');
                    setErrorMessage('Your GitHub session may have expired. Please try authenticating again.');
                    return;
                }
                throw new Error(result.details || result.error || 'Failed to create pull request.');
            }
            setPullRequestUrl(result.pullRequestUrl);
            setStatus('success');
        } catch (error: any) {
            setErrorMessage(error.message);
            setStatus('error');
        }
    };
    
    const handleInitialAction = async () => {
        // Check if token likely exists with a quick pre-flight check
        const res = await fetch('/api/github/pr/check-auth');
        if (res.ok) {
            handleCreatePR();
        } else {
            handleAuth();
        }
    }

    const renderContent = () => {
        switch (status) {
            case 'idle':
                return (
                    <div className="text-center">
                        <GitPullRequest className="mx-auto h-12 w-12 text-muted-foreground" />
                        <h3 className="mt-4 text-lg font-medium leading-6 text-foreground">Propose this blueprint</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            This will create a pull request on your behalf to the Weval community repository.
                        </p>
                        <Button onClick={handleInitialAction} className="mt-6 w-full">
                            Create Pull Request with GitHub
                        </Button>
                    </div>
                );
            case 'authenticating':
                 return (
                    <div className="text-center">
                        <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                        <h3 className="mt-4 text-lg font-medium">Waiting for GitHub</h3>
                        <p className="mt-2 text-sm text-muted-foreground">Please complete the authorization in the popup window.</p>
                    </div>
                );
            case 'creating_pr':
                return (
                     <div className="text-center">
                        <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                        <h3 className="mt-4 text-lg font-medium">Creating Pull Request...</h3>
                        <p className="mt-2 text-sm text-muted-foreground">This may take a moment. Please don't close this window.</p>
                    </div>
                );
            case 'success':
                 return (
                    <div className="text-center">
                        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                        <h3 className="mt-4 text-lg font-medium">Pull Request Created!</h3>
                        <p className="mt-2 text-sm text-muted-foreground">Thank you for your contribution.</p>
                        <Button asChild className="mt-6 w-full">
                           <a href={pullRequestUrl} target="_blank" rel="noopener noreferrer">
                                View Pull Request
                                <ExternalLink className="ml-2 h-4 w-4" />
                           </a>
                        </Button>
                    </div>
                );
            case 'error':
                 return (
                    <div className="text-center">
                        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" />
                        <h3 className="mt-4 text-lg font-medium">An Error Occurred</h3>
                        <p className="mt-2 text-sm text-muted-foreground bg-destructive/10 p-3 rounded-md">{errorMessage}</p>
                         <Button onClick={() => setStatus('idle')} className="mt-6 w-full" variant="secondary">
                            Try Again
                        </Button>
                    </div>
                );
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="p-4">
                <Suspense fallback={<div className="text-center"><Loader2 className="mx-auto h-12 w-12 animate-spin" /></div>}>
                    {renderContent()}
                </Suspense>
            </div>
        </Modal>
    );
} 