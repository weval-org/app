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
  preference: 'A' | 'B' | 'Indifferent';
  reason?: string;
  timestamp: string;
  user?: {
    github_username: string;
  };
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

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Timestamp</TableHead>
              <TableHead className="w-[120px]">Preference</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="w-[150px]">User</TableHead>
              <TableHead className="text-right">Task ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                </TableRow>
              ))
            ) : data.length > 0 ? (
              data.map((row) => (
                <TableRow key={row.taskId + row.timestamp}>
                  <TableCell>
                    <ClientDateTime timestamp={row.timestamp} />
                  </TableCell>
                  <TableCell>
                    <span className={`font-semibold ${
                      row.preference === 'A' ? 'text-blue-500' :
                      row.preference === 'B' ? 'text-green-500' :
                      'text-gray-500'
                    }`}>
                      {row.preference}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-xs truncate" title={row.reason}>
                    {row.reason || <span className="text-muted-foreground italic">No reason given</span>}
                  </TableCell>
                  <TableCell>{row.user?.github_username || 'Anonymous'}</TableCell>
                  <TableCell className="text-right font-mono text-xs" title={row.taskId}>
                    {row.taskId.substring(0, 12)}...
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
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