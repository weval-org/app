import React from 'react';

/**
 * Skeleton loader animation for evaluation cells while data is loading
 */
export const EvaluationSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-2">
    <div className="flex items-center gap-2">
      <div className="h-5 w-5 bg-muted rounded"></div>
      <div className="h-4 bg-muted rounded w-12"></div>
      <div className="h-2 bg-muted rounded flex-1"></div>
    </div>
    <div className="h-3 bg-muted rounded w-full"></div>
    <div className="h-3 bg-muted rounded w-4/5"></div>
  </div>
);
