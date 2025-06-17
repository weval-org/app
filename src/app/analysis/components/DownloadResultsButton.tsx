'use client';

import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { ComparisonDataV2 } from '@/app/utils/types';
import { toSafeTimestamp } from '@/app/utils/timestampUtils';

const DownloadIcon = dynamic(() => import('lucide-react').then(mod => mod.Download));

interface DownloadResultsButtonProps {
  data: ComparisonDataV2 | null;
  label: string;
}

export default function DownloadResultsButton({ data, label }: DownloadResultsButtonProps) {
  const handleDownload = () => {
    if (!data) {
      console.error("No data available to download.");
      // Optionally, provide user feedback, e.g., via a toast notification
      return;
    }

    try {
      const jsonData = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      console.log('data>>', data.timestamp);

      // Use data.timestamp for the filename, formatted to be filename-friendly.
      // The incoming timestamp can already be in the "safe" format, which isn't directly
      // parsable by `new Date()`. We now use `toSafeTimestamp` to ensure a consistent,
      // safe format, whether we're using an existing timestamp or generating a new one.
      const dataTimestamp = data.timestamp 
        ? data.timestamp
        : toSafeTimestamp(new Date().toISOString());
      
      const filename = `${label}_analysis_export_${dataTimestamp}.json`;

      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error preparing data for download:", error);
      // Optionally, provide user feedback
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDownload}
      disabled={!data}
      className="text-green-600 dark:text-green-400 border-green-600/70 dark:border-green-700/70 hover:bg-green-600/10 dark:hover:bg-green-700/30 hover:text-green-700 dark:hover:text-green-300 px-3 py-1.5 text-xs"
      title="Download the full analysis data as a JSON file"
    >
      {DownloadIcon && <DownloadIcon className="w-3.5 h-3.5 mr-1.5" />}
      Download Results
    </Button>
  );
} 