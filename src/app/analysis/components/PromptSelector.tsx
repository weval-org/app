'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAnalysis } from '../context/AnalysisContext';

export const PromptSelector: React.FC = () => {
    const router = useRouter();
    const { 
        data, 
        configId,
        runLabel,
        timestamp,
        currentPromptId,
    } = useAnalysis();

    const getPromptContextDisplayString = (promptId: string): string => {
        if (!data || !data.promptContexts) return promptId;
        const context = data.promptContexts[promptId];
        if (typeof context === 'string') {
          return context;
        }
        if (Array.isArray(context) && context.length > 0) {
          const lastUserMessage = [...context].reverse().find(msg => msg.role === 'user');
          if (lastUserMessage && typeof lastUserMessage.content === 'string') {
            const text = lastUserMessage.content;
            return `User: ${text.substring(0, 300)}${text.length > 300 ? '...' : ''}`;
          }
          return `Multi-turn context (${context.length} messages)`;
        }
        return promptId;
    };
    
    if (!data || !data.promptIds || data.promptIds.length === 0) return null;

    const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedPromptId = event.target.value;
      const basePath = `/analysis/${configId}/${runLabel}/${timestamp}`;

      if (selectedPromptId === '__ALL__') {
        router.push(basePath);
      } else {
        router.push(`${basePath}?prompt=${selectedPromptId}`);
      }
    };

    return (
      <div className="mb-6">
        <label htmlFor="prompt-selector" className="block text-sm font-medium text-muted-foreground dark:text-muted-foreground mb-1">Select Prompt:</label>
        <select
          id="prompt-selector"
          value={currentPromptId || '__ALL__'}
          onChange={handleSelectChange}
          className="block w-full p-2 border border-border dark:border-border rounded-md shadow-sm focus:ring-primary focus:border-primary bg-card dark:bg-card text-card-foreground dark:text-card-foreground text-sm"
        >
          <option value="__ALL__" className="bg-background text-foreground dark:bg-background dark:text-foreground">All Prompts (Overall Analysis)</option>
          {data.promptIds.map(promptId => (
            <option key={promptId} value={promptId} title={getPromptContextDisplayString(promptId)} className="bg-background text-foreground dark:bg-background dark:text-foreground">
              {promptId} - {getPromptContextDisplayString(promptId)}
            </option>
          ))}
        </select>
      </div>
    );
}; 