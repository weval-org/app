import React from 'react';

/**
 * Full-section loading overlay with spinner
 * Used for major content sections while they're loading
 */
export const SectionLoadingOverlay: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <div className="text-center space-y-4">
      <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      <p className="text-muted-foreground">{message}</p>
    </div>
  </div>
);
