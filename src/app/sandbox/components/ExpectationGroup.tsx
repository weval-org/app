'use client';

import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import { PointDefinition } from '@/cli/types/cli_types';
import { ExpectationEditor } from './ExpectationEditor';
import { produce } from 'immer';

const Plus = dynamic(() => import('lucide-react').then(mod => mod.Plus));
const CheckCircle = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle));
const XCircle = dynamic(() => import('lucide-react').then(mod => mod.XCircle));

type ExpectationVariant = 'should' | 'should-not';

interface ExpectationGroupProps {
  title: string | null;
  description?: string | null;
  expectations: PointDefinition[];
  onUpdate: (expectations: PointDefinition[]) => void;
  variant: ExpectationVariant;
  isEditable: boolean;
  placeholder?: string;
}

export function ExpectationGroup({ title, description, expectations, onUpdate, variant, isEditable, placeholder }: ExpectationGroupProps) {
  const handleAdd = () => {
    const nextState = produce(expectations, draft => {
        draft.push({ text: '', multiplier: 1.0 });
    });
    onUpdate(nextState);
  };

  const handleUpdate = (index: number, updatedExp: PointDefinition) => {
    const nextState = produce(expectations, draft => {
        draft[index] = updatedExp;
    });
    onUpdate(nextState);
  };

  const handleRemove = (index: number) => {
    const nextState = produce(expectations, draft => {
        draft.splice(index, 1);
    });
    onUpdate(nextState);
  };

  const styles = {
    should: { Icon: CheckCircle, titleColor: 'text-green-700 dark:text-green-400' },
    'should-not': { Icon: XCircle, titleColor: 'text-destructive' },
  }[variant];

  return (
    <div className="space-y-2">
      {title && (
        <h4 className={`font-semibold text-sm flex items-center gap-2 ${styles.titleColor}`}>
          <styles.Icon className="w-4 h-4" />
          {title}
        </h4>
      )}
      {description && <p className="text-xs text-muted-foreground mb-2">{description}</p>}
      <div className={`${title ? 'pl-5' : ''} space-y-2`}>
        {expectations.map((exp, index) => (
          <ExpectationEditor
            key={index}
            expectation={exp}
            onUpdate={(updated) => handleUpdate(index, updated)}
            onRemove={() => handleRemove(index)}
            variant={variant}
            isEditable={isEditable}
            placeholder={placeholder || "e.g., is empathetic and understanding"}
          />
        ))}
        {isEditable && (
            <Button 
                size="sm" 
                variant="ghost" 
                onClick={handleAdd} 
                className="text-muted-foreground h-8"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add criterion
            </Button>
        )}
      </div>
    </div>
  );
} 