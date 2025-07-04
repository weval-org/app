'use client';

import { Checkbox } from "@/components/ui/checkbox";
import { getModelDisplayLabel } from "@/app/utils/modelIdUtils";

interface ModelSelectorProps {
  selectedModels: string[];
  availableModels: string[];
  onSelectionChange: (selected: string[]) => void;
  maxSelection: number;
  disabled?: boolean;
}

export function ModelSelector({
  selectedModels,
  availableModels,
  onSelectionChange,
  maxSelection,
  disabled = false,
}: ModelSelectorProps) {
  const isMaxSelected = selectedModels.length >= maxSelection;

  const handleCheckedChange = (modelId: string, isChecked: boolean) => {
    let newSelection;
    if (isChecked) {
      if (selectedModels.length < maxSelection) {
        newSelection = [...selectedModels, modelId];
      } else {
        return; // Don't add if max is reached
      }
    } else {
      newSelection = selectedModels.filter((id) => id !== modelId);
    }
    onSelectionChange(newSelection);
  };

  return (
    <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
            Select up to {maxSelection} models to include in this sandbox run.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[40vh] overflow-y-auto p-1">
            {availableModels.map(modelId => {
                const isChecked = selectedModels.includes(modelId);
                const isDisabled = disabled || (!isChecked && isMaxSelected);
                const modelName = getModelDisplayLabel(modelId, { hideProvider: true });
                const provider = modelId.split(':')[0] || 'Unknown';

                return (
                    <div
                        key={modelId}
                        className={`flex items-center space-x-3 rounded-md border p-3 transition-colors ${
                            isDisabled ? 'cursor-not-allowed opacity-50 bg-muted/50' : 'cursor-pointer'
                        } ${
                            isChecked ? 'border-primary' : ''
                        }`}
                        onClick={() => !isDisabled && handleCheckedChange(modelId, !isChecked)}
                    >
                        <Checkbox
                            id={modelId}
                            checked={isChecked}
                            onCheckedChange={(checked: boolean) => handleCheckedChange(modelId, checked)}
                            disabled={isDisabled}
                        />
                        <label
                            htmlFor={modelId}
                            className={`flex flex-col ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                            <span className="font-medium text-sm text-foreground">{modelName}</span>
                            <span className="text-xs text-muted-foreground">{provider}</span>
                        </label>
                    </div>
                );
            })}
        </div>
    </div>
  );
} 