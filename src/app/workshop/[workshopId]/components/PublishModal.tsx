'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Share2, AlertCircle } from 'lucide-react';

interface PublishModalProps {
  open: boolean;
  onClose: () => void;
  onPublish: (metadata: { authorName: string; description: string }) => Promise<any>;
  defaultAuthorName?: string;
  defaultDescription?: string;
}

export function PublishModal({
  open,
  onClose,
  onPublish,
  defaultAuthorName = '',
  defaultDescription = '',
}: PublishModalProps) {
  const [authorName, setAuthorName] = useState(defaultAuthorName);
  const [description, setDescription] = useState(defaultDescription);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [published, setPublished] = useState(false);

  const handlePublish = async () => {
    if (!authorName.trim()) {
      setError('Please enter your name');
      return;
    }

    if (!description.trim()) {
      setError('Please enter a description');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const result = await onPublish({
        authorName: authorName.trim(),
        description: description.trim(),
      });

      if (result && result.shareUrl) {
        const fullUrl = `${window.location.origin}${result.shareUrl}`;
        setShareUrl(fullUrl);
        setPublished(true);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to publish');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
  };

  const handleClose = () => {
    // Reset state when closing
    setPublished(false);
    setShareUrl('');
    setError('');
    onClose();
  };

  if (published && shareUrl) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>Blueprint Published! 🎉</DialogTitle>
          <DialogDescription>
            Your blueprint has been published to the workshop and is now visible to all participants.
          </DialogDescription>

          <div className="space-y-4 mt-4">
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 rounded-md">
              <p className="text-sm font-medium mb-2">Share this link:</p>
              <div className="flex gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button onClick={handleCopyUrl} variant="outline">
                  Copy
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Button onClick={handleClose} className="w-full">
                Close
              </Button>
              <Button
                onClick={() => window.open(shareUrl, '_blank')}
                variant="outline"
                className="w-full"
              >
                View Published Blueprint
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Publish to Workshop</DialogTitle>
        <DialogDescription>
          Share your blueprint with workshop participants. You can edit the description before publishing.
        </DialogDescription>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="authorName">Your Name</Label>
            <Input
              id="authorName"
              placeholder="e.g., Sarah"
              value={authorName}
              onChange={(e) => {
                setAuthorName(e.target.value);
                setError('');
              }}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Your name will be shown in the gallery. You'll also receive a 4-digit PIN for cross-device recovery.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Blueprint Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what this evaluation tests..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setError('');
              }}
              disabled={isLoading}
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Participants will see this description in the gallery
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleClose} variant="outline" className="flex-1" disabled={isLoading}>
              Cancel
            </Button>
            <Button
              onClick={handlePublish}
              className="flex-1"
              disabled={isLoading || !authorName.trim() || !description.trim()}
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-background border-t-transparent mr-2"></div>
                  Publishing...
                </>
              ) : (
                <>
                  <Share2 className="mr-2 h-4 w-4" />
                  Publish
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
