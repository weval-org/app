'use client';

import { useEffect, useState } from 'react';
import { ComparisonConfig } from '@/cli/types/cli_types';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

type Status = 'pending' | 'running' | 'completed' | 'failed';

interface RunStatus {
    status: Status;
    message: string;
    lastUpdated: string;
    payload?: {
        resultUrl?: string;
    };
}

const ApiRunView = ({ runId }: { runId: string }) => {
    const [blueprint, setBlueprint] = useState<ComparisonConfig | null>(null);
    const [status, setStatus] = useState<RunStatus | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchBlueprint = async () => {
            try {
                const res = await fetch(`/api/v1/evaluations/blueprint/${runId}`);
                if (!res.ok) {
                    throw new Error('Failed to fetch blueprint');
                }
                const data = await res.json();
                setBlueprint(data);
            } catch (err: any) {
                setError(err.message);
            }
        };
        fetchBlueprint();
    }, [runId]);

    useEffect(() => {
        const pollStatus = async () => {
            try {
                const res = await fetch(`/api/v1/evaluations/status/${runId}`);
                if (!res.ok) {
                    // Don't throw, just log, as it might be a temporary issue
                    console.error('Failed to fetch status');
                    return;
                }
                const data: RunStatus = await res.json();
                setStatus(data);

                if (data.status === 'completed' || data.status === 'failed') {
                    clearInterval(intervalId);
                }
            } catch (err) {
                console.error('Error polling status:', err);
            }
        };

        pollStatus(); // Initial fetch
        const intervalId = setInterval(pollStatus, 5000); // Poll every 5 seconds

        return () => clearInterval(intervalId);
    }, [runId]);

    if (error) {
        return <div className="container mx-auto p-4 text-red-500">Error: {error}</div>;
    }

    if (!blueprint || !status) {
        return <div className="container mx-auto p-4">Loading...</div>;
    }

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Evaluation Run: {runId}</h1>
            
            <div className="mb-8 p-4 border rounded-lg">
                <h2 className="text-xl font-semibold mb-2">Status: {status.status}</h2>
                <p className="text-gray-600">{status.message}</p>
                <p className="text-sm text-gray-500">Last updated: {new Date(status.lastUpdated).toLocaleString()}</p>
                {status.status === 'completed' && status.payload?.resultUrl && (
                    <Button asChild className="mt-4">
                        <Link href={status.payload.resultUrl}>View Results</Link>
                    </Button>
                )}
            </div>

            <div className="p-4 border rounded-lg">
                <h2 className="text-xl font-semibold mb-2">Blueprint Details</h2>
                <pre className="bg-gray-100 p-4 rounded-md overflow-x-auto">
                    {JSON.stringify(blueprint, null, 2)}
                </pre>
            </div>
        </div>
    );
};

export default ApiRunView;
