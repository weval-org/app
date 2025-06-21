'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import DownloadResultsButton from '@/app/analysis/components/DownloadResultsButton';
import { ComparisonDataV2 } from '@/app/utils/types';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TerminalIcon = dynamic(() => import("lucide-react").then((mod) => mod.Terminal));

interface DebugPanelProps {
  data: ComparisonDataV2 | null;
  configId: string;
  runLabel: string;
  timestamp?: string;
}

export default function DebugPanel({ data, configId, runLabel, timestamp }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [directoryInfo, setDirectoryInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('data');

  if (!data) {
    return (
      <div className="mt-8 bg-card/60 backdrop-blur-sm p-4 rounded-xl shadow-lg ring-1 ring-border">
        <h3 className="text-lg font-semibold text-foreground mb-2">Debug Panel</h3>
        <p className="text-muted-foreground">No data available to display.</p>
      </div>
    );
  }

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const checkDirectory = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/debug?action=check-directory');
      const result = await response.json();
      setDirectoryInfo(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Error checking directory:', err);
      setDirectoryInfo(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const displayableTimestamp = timestamp ? new Date(fromSafeTimestamp(timestamp)).toLocaleString() : 'N/A';
  const displayLabel = `${data?.configTitle || configId} - ${data?.runLabel || runLabel}${timestamp ? ' (' + displayableTimestamp + ')' : ''}`;

  return (
    <div className="mt-8 bg-card/60 dark:bg-slate-800/60 backdrop-blur-sm p-4 rounded-xl shadow-lg ring-1 ring-border">
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          {TerminalIcon && <TerminalIcon className="w-5 h-5 mr-2.5 text-highlight-info" />}
          <h2 className="text-lg font-semibold text-card-foreground">Advanced Tools</h2>
        </div>
        <div className="space-x-2">
          <Button
            variant="outline"
            size="sm"
            className="text-highlight-info border-highlight-info/70 hover:bg-highlight-info/10 hover:text-highlight-info px-3 py-1.5 text-xs"
            onClick={() => setIsOpen(!isOpen)}
          >
            {isOpen ? 'Hide' : 'Show'} Raw JSON Data
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-cyan-500 dark:text-cyan-300 border-cyan-600/70 dark:border-cyan-700/70 hover:bg-cyan-500/10 dark:hover:bg-cyan-700/30 hover:text-cyan-600 dark:hover:text-cyan-200 px-3 py-1.5 text-xs"
            onClick={checkDirectory}
            disabled={isLoading}
          >
            {isLoading ? 'Checking Dir...' : 'Check Results Dir'}
          </Button>
          <DownloadResultsButton data={data} label={displayLabel} />
        </div>
      </div>

      {isOpen && (
        <div className="mt-4 bg-muted/70 dark:bg-slate-900/70 text-muted-foreground dark:text-slate-200 p-3.5 rounded-lg overflow-auto max-h-[400px] ring-1 ring-border shadow-inner">
          <pre className="text-xs leading-relaxed">{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}

      {directoryInfo && (
        <div className="mt-3 bg-muted/70 dark:bg-slate-900/70 text-muted-foreground dark:text-slate-200 p-3.5 rounded-lg overflow-auto max-h-[300px] ring-1 ring-border shadow-inner">
          <h3 className="text-sm font-semibold mb-1.5 text-card-foreground dark:text-slate-300">Results Directory API Response:</h3>
          <pre className="text-xs leading-relaxed">{directoryInfo}</pre>
        </div>
      )}
    </div>
  );
} 