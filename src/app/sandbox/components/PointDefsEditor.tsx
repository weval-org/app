'use client';

import { Input } from '@/components/ui/input';
import { AutoExpandTextarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';
import React from 'react';

interface PointDefsEditorProps {
  pointDefs: Record<string, string> | undefined;
  onChange: (defs: Record<string, string>) => void;
  isEditable: boolean;
}

export function PointDefsEditor({ pointDefs, onChange, isEditable }: PointDefsEditorProps) {
  console.log('[PointDefsEditor] render', pointDefs);
  const defsEntries = Object.entries(pointDefs || {});

  const renameKey = (oldKey: string, newKey: string) => {
    if (oldKey === newKey) return;
    const defs = { ...(pointDefs || {}) } as Record<string, string>;
    const current = defs[oldKey];
    delete defs[oldKey];
    defs[newKey] = current;
    onChange(defs);
  };

  const updateCode = (key: string, code: string) => {
    const defs = { ...(pointDefs || {}) } as Record<string, string>;
    defs[key] = code;
    onChange(defs);
  };

  const deleteKey = (key: string) => {
    const defs = { ...(pointDefs || {}) } as Record<string, string>;
    delete defs[key];
    onChange(defs);
  };

  const addDef = () => {
    console.log('[PointDefsEditor] addDef clicked');
    const defs = { ...(pointDefs || {}) } as Record<string, string>;
    let base = 'newDef';
    let i = 1;
    let name = base;
    while (defs[name]) {
      name = `${base}${i++}`;
    }
    defs[name] = '// return { score: 1, explain: "..." }';
    onChange(defs);
  };

  return (
    <div className="space-y-2">
      {defsEntries.map(([key, code], idx) => (
        <div key={idx} className="border rounded-md p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={key}
              placeholder="functionName"
              className="text-sm flex-1"
              readOnly={!isEditable}
              onChange={(e) => isEditable && renameKey(key, e.target.value)}
            />
            {isEditable && (
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                onClick={() => deleteKey(key)}
              >
                <Icon name="trash" className="w-4 h-4" />
              </Button>
            )}
          </div>
          <AutoExpandTextarea
            value={code}
            placeholder="JavaScript code…"
            minRows={2}
            maxRows={8}
            className="text-sm"
            readOnly={!isEditable}
            onChange={(e) => isEditable && updateCode(key, e.target.value)}
          />
        </div>
      ))}

      {isEditable && (
        <Button type="button" variant="outline" size="sm" onClick={addDef}>
          <Icon name="plus" className="h-3 w-3 mr-1" /> Add Definition
        </Button>
      )}
    </div>
  );
}
