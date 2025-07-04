'use client';

import React, { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface ProposeBlueprintModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { title: string; body: string }) => void;
    isSubmitting: boolean;
}

export function ProposeBlueprintModal({ isOpen, onClose, onSubmit, isSubmitting }: ProposeBlueprintModalProps) {
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');

    const handleSubmit = () => {
        onSubmit({ title, body });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[525px]">
                <DialogHeader>
                    <DialogTitle>Propose Blueprint</DialogTitle>
                    <DialogDescription>
                        Create a pull request to propose your blueprints for inclusion in the main Weval library.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="title" className="text-right">
                            Title
                        </Label>
                        <Input
                            id="title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="col-span-3"
                            placeholder="feat: Add new blueprint for..."
                        />
                    </div>
                    <div className="grid grid-cols-4 items-start gap-4">
                        <Label htmlFor="body" className="text-right pt-2">
                            Description
                        </Label>
                        <Textarea
                            id="body"
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            className="col-span-3"
                            placeholder="Provide a brief summary of the changes in your proposal."
                            rows={5}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button type="submit" onClick={handleSubmit} disabled={isSubmitting || !title.trim()}>
                        {isSubmitting ? 'Submitting...' : 'Create Pull Request'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 