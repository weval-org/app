import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface RunConfirmationDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isAdvancedMode: boolean;
}

export function RunConfirmationDialog({ isOpen, onClose, onConfirm, isAdvancedMode }: RunConfirmationDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {isAdvancedMode ? "Run Full Evaluation?" : "Test Blueprint?"}
                    </DialogTitle>
                    <DialogDescription asChild>
                        <div className="space-y-3 pt-3">
                            {isAdvancedMode ? (
                                <>
                                    <div className="pb-2">
                                        You are about to run a full evaluation of your blueprint. This will:
                                    </div>
                                    <ul className="list-disc pl-6 space-y-2">
                                        <li>Test all selected models against your prompts</li>
                                        <li>Generate detailed coverage analysis</li>
                                        <li>Create similarity matrices and comparisons</li>
                                        <li>This may take several minutes depending on the number of models and prompts</li>
                                        <li>Results will only be stored for one week.</li>
                                    </ul>
                                </>
                            ) : (
                                <>
                                    <div className="pb-2">
                                        You are about to test your blueprint. This will:
                                    </div>
                                    <ul className="list-disc pl-6 space-y-2">
                                        <li>Run your prompts against a subset of models</li>
                                        <li>Generate a basic coverage analysis</li>
                                        <li>This usually takes 1-2 minutes</li>
                                        <li>Results will only be stored for one week.</li>
                                    </ul>
                                </>
                            )}
                        </div>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex flex-row justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={onConfirm}>
                        {isAdvancedMode ? "Start Evaluation" : "Start Test"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
} 