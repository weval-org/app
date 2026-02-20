'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BugReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string | null;
}

function extractBlueprintId(pathname: string | null): string {
  const match = pathname?.match(/^\/analysis\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function getDeviceInfo() {
  if (typeof window === 'undefined') return { browser: '', os: '', pageUrl: '' };
  const ua = navigator.userAgent;
  let browser = 'Unknown';
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Safari/')) browser = 'Safari';

  let os = 'Unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';

  return { browser, os, pageUrl: window.location.href };
}

export function BugReportModal({ open, onOpenChange, pathname }: BugReportModalProps) {
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const blueprintId = extractBlueprintId(pathname);

  useEffect(() => {
    if (open) {
      setStatus('idle');
      setErrorMessage('');
    }
  }, [open, pathname]);

  function resetForm() {
    setDescription('');
    setSteps('');
    setEmail('');
    setStatus('idle');
    setErrorMessage('');
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) resetForm();
    onOpenChange(isOpen);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;

    setStatus('submitting');
    const { browser, os, pageUrl } = getDeviceInfo();

    try {
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          steps: steps.trim(),
          blueprintId,
          email: email.trim(),
          pageUrl,
          browser,
          os,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit bug report');
      }

      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const { browser, os, pageUrl } = typeof window !== 'undefined' ? getDeviceInfo() : { browser: '', os: '', pageUrl: '' };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report a Bug</DialogTitle>
          <DialogDescription>
            Help us improve by reporting issues you encounter.
          </DialogDescription>
        </DialogHeader>

        {status === 'success' ? (
          <div className="py-6 text-center space-y-3">
            <p className="text-sm font-medium text-green-600 dark:text-green-400">
              Bug report submitted successfully!
            </p>
            <p className="text-xs text-muted-foreground">
              Thank you for helping us improve.
            </p>
            <Button variant="outline" size="sm" onClick={() => handleClose(false)}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bug-description">
                What went wrong? <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="bug-description"
                placeholder="Describe the issue you encountered..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bug-steps">Steps to reproduce</Label>
              <Textarea
                id="bug-steps"
                placeholder="1. Go to...  2. Click on...  3. See error..."
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bug-email">Email for follow-up</Label>
              <Input
                id="bug-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {status === 'error' && (
              <p className="text-sm text-destructive">{errorMessage}</p>
            )}

            <Button type="submit" className="w-full" disabled={status === 'submitting' || !description.trim()}>
              {status === 'submitting' ? 'Submitting...' : 'Submit Bug Report'}
            </Button>

            <p className="text-[11px] text-muted-foreground/70 leading-tight">
              Auto-detected: {pageUrl || 'page URL'} · {browser || 'browser'} · {os || 'OS'}
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
