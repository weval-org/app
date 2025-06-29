'use client';

import { Button } from '@/components/ui/button';
import dynamic from 'next/dynamic';
import { Expectation } from './types';
import { ExpectationEditor } from './ExpectationEditor';

const Plus = dynamic(() => import('lucide-react').then(mod => mod.Plus));
const CheckCircle = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle));
const XCircle = dynamic(() => import('lucide-react').then(mod => mod.XCircle));

const MAX_CRITERIA = 10;

interface ExpectationGroupProps {
  title: string;
  expectations: Expectation[];
  onUpdate: (exps: Expectation[]) => void;
  variant: 'should' | 'should-not';
}

export function ExpectationGroup({ title, expectations, onUpdate, variant }: ExpectationGroupProps) {
  const handleAdd = () => {
    if (expectations.length < MAX_CRITERIA) {
        onUpdate([...expectations, { id: `exp-${Date.now()}`, value: '' }]);
    }
  };
  const handleUpdate = (id: string, updatedExp: Expectation) => {
    onUpdate(expectations.map(exp => (exp.id === id ? updatedExp : exp)));
  };
  const handleRemove = (id: string) => {
    onUpdate(expectations.filter(exp => exp.id !== id));
  };

  const styles = {
    should: { Icon: CheckCircle, titleColor: 'text-green-800 dark:text-green-300' },
    'should-not': { Icon: XCircle, titleColor: 'text-red-800 dark:text-red-300' },
  }[variant];

  const isLimitReached = expectations.length >= MAX_CRITERIA;

  return (
    <div className="space-y-3">
      <h4 className={`font-semibold text-sm flex items-center gap-2 ${styles.titleColor}`}>
        <styles.Icon className="w-4 h-4" />
        {title}
      </h4>
      <div className="pl-6 space-y-3">
        {expectations.map(exp => (
          <ExpectationEditor
            key={exp.id}
            expectation={exp}
            onUpdate={(updated) => handleUpdate(exp.id, updated)}
            onRemove={() => handleRemove(exp.id)}
            variant={variant}
          />
        ))}
        <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleAdd} 
            className="text-muted-foreground"
            disabled={isLimitReached}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add criterion ({expectations.length}/{MAX_CRITERIA})
        </Button>
      </div>
    </div>
  );
} 