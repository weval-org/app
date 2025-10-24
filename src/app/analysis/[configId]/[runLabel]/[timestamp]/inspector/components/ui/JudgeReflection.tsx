import React, { useState } from 'react';

/**
 * Component to render judge reflection text with expand/collapse functionality
 * Automatically truncates long reflections with a toggle button
 */
export const JudgeReflection: React.FC<{ text: string }> = ({ text }) => {
  const [expanded, setExpanded] = useState(false);
  const TRUNCATE_LENGTH = 85;

  // Only truncate if text is longer than threshold
  const shouldTruncate = text.length > TRUNCATE_LENGTH;
  const truncatedText = shouldTruncate ? text.substring(0, TRUNCATE_LENGTH) : text;

  return (
    <div className="flex items-start gap-1">
      <span className="flex-1">
        {expanded ? text : truncatedText}
      </span>
      {shouldTruncate && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-muted-foreground hover:text-foreground font-mono flex-shrink-0 ml-1"
        >
          {expanded ? '[-]' : '[+]'}
        </button>
      )}
    </div>
  );
};
