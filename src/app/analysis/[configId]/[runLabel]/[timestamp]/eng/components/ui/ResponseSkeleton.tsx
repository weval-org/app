import React from 'react';

/**
 * Skeleton loader animation for response cells while data is loading
 */
export const ResponseSkeleton: React.FC = () => (
  <div className="animate-pulse space-y-2 p-2">
    <div className="h-3 bg-muted rounded w-full"></div>
    <div className="h-3 bg-muted rounded w-5/6"></div>
    <div className="h-3 bg-muted rounded w-4/6"></div>
    <div className="h-3 bg-muted rounded w-full"></div>
    <div className="h-3 bg-muted rounded w-3/6"></div>
  </div>
);
