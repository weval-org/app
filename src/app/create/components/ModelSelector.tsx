'use client';

import { Checkbox } from "@/components/ui/checkbox";
import { getModelDisplayLabel } from "@/app/utils/modelIdUtils";

interface ModelSelectorProps {
  availableModels: string[];
  selectedModels: string[];
  onSelectionChange: (selected: string[]) => void;
  maxSelection: number;
}

export function ModelSelector({
  availableModels,
  selectedModels,
  onSelectionChange,
  maxSelection,
}: ModelSelectorProps) {
  
  const handleCheckedChange = (modelId: string, isChecked: boolean) => {
    let newSelection;
    if (isChecked) {
      if (selectedModels.length < maxSelection) {
        newSelection = [...selectedModels, modelId];
      } else {
        // Prevent selection if max is reached. The checkbox itself will also be disabled.
        return;
      }
    } else {
      newSelection = selectedModels.filter(id => id !== modelId);
    }
    onSelectionChange(newSelection);
  };

  const isMaxSelected = selectedModels.length >= maxSelection;

  return (
    <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
            Select up to {maxSelection} models to include in this playground run.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availableModels.map(modelId => {
                const isChecked = selectedModels.includes(modelId);
                const isDisabled = !isChecked && isMaxSelected;
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