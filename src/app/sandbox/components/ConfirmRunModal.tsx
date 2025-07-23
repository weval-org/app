'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import dynamic from "next/dynamic";

const Loader2 = dynamic(() => import('lucide-react').then(mod => mod.Loader2), { ssr: false });
const FlaskConical = dynamic(() => import('lucide-react').then(mod => mod.FlaskConical), { ssr: false });

interface ConfirmRunModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    models: string[];
    isSubmitting: boolean;
}

export function ConfirmRunModal({ isOpen, onClose, onConfirm, models, isSubmitting }: ConfirmRunModalProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Confirm Evaluation Models</DialogTitle>
                    <DialogDescription>
                        You are about to run an evaluation with the following models defined in your blueprint.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <div className="flex flex-wrap gap-2">
                        {models.map(model => (
                            <Badge key={model} variant="secondary" className="text-sm font-mono">
                                {model}
                            </Badge>
                        ))}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
                    <Button
                        onClick={onConfirm}
                        disabled={isSubmitting}
                        className="bg-exciting text-exciting-foreground hover:bg-exciting/90"
                    >
                        {isSubmitting ? (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
                        ) : (
                            <><FlaskConical className="w-4 h-4 mr-2" />Confirm and Run</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 