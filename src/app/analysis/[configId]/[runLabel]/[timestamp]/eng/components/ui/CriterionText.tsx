import React, { useState } from 'react';
import { formatCriterionText } from '../../utils/engFormatting';

/**
 * Component to render criterion text with smart truncation for function-style assertions
 * Supports expanding/collapsing long function arguments
 */
export const CriterionText: React.FC<{ text: string }> = ({ text }) => {
  const formatted = formatCriterionText(text);
  const [expanded, setExpanded] = useState(false);

  if (formatted.isFunction) {
    return (
      <div className="space-y-1">
        <div className="flex items-start gap-1.5">
          <code className="text-xs font-mono text-primary break-words whitespace-pre-wrap">
            {expanded ? formatted.full.replace('Function: ', '') : formatted.display}
          </code>
          {formatted.isTruncated && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-muted-foreground hover:text-foreground font-mono flex-shrink-0 mt-0.5"
            >
              {expanded ? '[-]' : '[+]'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return <div className="font-medium break-words">{formatted.display}</div>;
};
