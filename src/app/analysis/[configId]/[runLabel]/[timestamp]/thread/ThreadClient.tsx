'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import FlowThreadClient from './FlowThreadClient';
import SimpleThreadClient from './SimpleThreadClient';

type ViewType = 'flow' | 'simple';

const ThreadClient: React.FC = () => {
  const [viewType, setViewType] = useState<ViewType>('flow');

  // Load view preference from localStorage on mount
  useEffect(() => {
    const savedView = localStorage.getItem('thread-view-preference') as ViewType;
    if (savedView === 'flow' || savedView === 'simple') {
      setViewType(savedView);
    }
  }, []);

  // Save view preference to localStorage when changed
  const handleViewChange = (newView: ViewType) => {
    setViewType(newView);
    localStorage.setItem('thread-view-preference', newView);
  };

  return (
    <div className="w-full h-full">
      {/* View Toggle Controls */}
      <div className="flex items-center justify-between p-4 border-b bg-card/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">View:</span>
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewType === 'flow' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-r-none border-r"
              onClick={() => handleViewChange('flow')}
            >
              Flow Graph
            </Button>
            <Button
              variant={viewType === 'simple' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-l-none"
              onClick={() => handleViewChange('simple')}
            >
              Simple Thread
            </Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {viewType === 'flow' 
            ? 'Interactive node-based conversation visualization' 
            : 'Horizontally scrollable linear conversation view'
          }
        </div>
      </div>

      {/* Render Selected View */}
        <div className="flex-1">
        {viewType === 'flow' ? <FlowThreadClient /> : <SimpleThreadClient />}
      </div>
    </div>
  );
};

export default ThreadClient;