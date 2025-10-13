'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import ClientDateTime from '@/app/components/ClientDateTime';
import Link from 'next/link';
import Icon from '@/components/ui/icon';

interface PreferenceRecord {
  taskId: string;
  preference: 'A' | 'B' | 'Indifferent' | 'Unknown';
  reason?: string;
  timestamp: string;
  userToken?: string;
  // Enriched task metadata
  modelIdA?: string;
  modelIdB?: string;
  configId?: string;
  promptPreview?: string;
}

function LogPage() {
  const [data, setData] = useState<PreferenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/pairs/log');
        if (!response.ok) {
          throw new Error(`Failed to fetch log data: ${response.statusText}`);
        }
        const result = await response.json();
        setData(result);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="container mx-auto p-4 sm:p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Pairwise Preference Log</h1>
        <p className="text-muted-foreground mt-1">Showing the last 100 preference submissions for debugging.</p>
        <p className="text-sm text-muted-foreground mt-2">
          Back to{' '}
          <Link href="/pairs" className="underline text-primary">
            Pairs
          </Link>
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <Icon name="terminal" className="h-4 w-4" />
          <AlertTitle>Error Fetching Data</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Timestamp</TableHead>
              <TableHead className="w-[100px]">Preference</TableHead>
              <TableHead className="w-[200px]">Model A</TableHead>
              <TableHead className="w-[200px]">Model B</TableHead>
              <TableHead className="w-[180px]">Config</TableHead>
              <TableHead className="w-[250px]">Prompt</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-44" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-44" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-56" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                </TableRow>
              ))
            ) : data.length > 0 ? (
              data.map((row) => (
                <TableRow key={row.taskId + row.timestamp}>
                  <TableCell className="text-sm">
                    <ClientDateTime timestamp={row.timestamp} />
                  </TableCell>
                  <TableCell>
                    <span className={`font-semibold ${
                      row.preference === 'A' ? 'text-blue-500' :
                      row.preference === 'B' ? 'text-green-500' :
                      row.preference === 'Unknown' ? 'text-purple-500' :
                      'text-yellow-500'
                    }`}>
                      {row.preference}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs" title={row.modelIdA}>
                    {row.modelIdA ? (
                      <span className="truncate block max-w-[200px]">{row.modelIdA}</span>
                    ) : (
                      <span className="text-muted-foreground italic">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs" title={row.modelIdB}>
                    {row.modelIdB ? (
                      <span className="truncate block max-w-[200px]">{row.modelIdB}</span>
                    ) : (
                      <span className="text-muted-foreground italic">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs" title={row.configId}>
                    {row.configId ? (
                      <Link
                        href={`/pairs/${row.configId}`}
                        className="text-primary hover:underline truncate block max-w-[180px]"
                      >
                        {row.configId}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground italic">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs max-w-[250px]" title={row.promptPreview}>
                    {row.promptPreview ? (
                      <span className="truncate block">{row.promptPreview}</span>
                    ) : (
                      <span className="text-muted-foreground italic">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm" title={row.reason}>
                    {row.reason || <span className="text-muted-foreground italic">No reason given</span>}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  No preference data found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default LogPage; 