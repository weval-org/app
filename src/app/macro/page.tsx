'use client';

import React from 'react';
import MacroViewer from '@/app/macro/components/MacroViewer';

export default function MacroPage() {
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-2">Macro Canvas</h1>
      <p className="text-sm text-muted-foreground mb-4">Zoom and pan. Hover shows the mapped config/prompt/model/point.</p>
      <MacroViewer />
    </div>
  );
}


