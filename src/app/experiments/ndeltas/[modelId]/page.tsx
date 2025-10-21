import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fromSafeTimestamp } from '@/lib/timestampUtils';
import { SiteHeader } from '@/app/components/SiteHeader';
import { SiteFooter } from '@/app/components/SiteFooter';
import type { ModelNDeltasFileContent, ModelPromptDeltaEntry } from '@/lib/storageService';

export const metadata = {
  title: 'NDeltas – Model Weak Points',
};

// Types imported from storage service

async function fetchNDeltas(modelId: string): Promise<ModelNDeltasFileContent | null> {
  const base = process.env.NEXT_PUBLIC_APP_URL || '';
  const url = base ? `${base}/api/ndeltas/${encodeURIComponent(modelId)}` : `/api/ndeltas/${encodeURIComponent(modelId)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as ModelNDeltasFileContent;
}

export default async function NDeltasPage({ params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  // Interpret route param as base core name (e.g., "gpt-4o")
  const core = decodeURIComponent(modelId);
  const data = await fetchNDeltas(core);
  if (!data) return notFound();

  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader contentMaxWidth="max-w-[1600px]" />
      <main className="flex-grow w-full bg-background text-foreground">
        <div className="mx-auto max-w-[1600px] px-4 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Weak Points for {core}</h1>
            <p className="text-sm text-muted-foreground">Rows are sorted by most negative delta: where this model underperforms the peer average for a prompt after aggregating sys/temp variants.</p>
            <p className="text-xs text-muted-foreground">Generated: {new Date(data.generatedAt).toLocaleString()} • {data.totalEntries} entries</p>
          </div>

          <div className="overflow-x-auto border rounded-md">
        <table className="min-w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-3 py-2">Delta</th>
              <th className="text-left px-3 py-2">Coverage</th>
              <th className="text-left px-3 py-2">Peers avg</th>
              <th className="text-left px-3 py-2">Rank</th>
              <th className="text-left px-3 py-2">Quartile</th>
              <th className="text-left px-3 py-2">Top Bases</th>
              <th className="text-left px-3 py-2">Prompt</th>
              <th className="text-left px-3 py-2">Response</th>
              <th className="text-left px-3 py-2">Config</th>
              <th className="text-left px-3 py-2">Run</th>
              <th className="text-left px-3 py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e, idx) => (
              <tr key={`${e.configId}-${e.promptId}-${idx}`} className={idx % 2 ? 'bg-muted/30' : ''}>
                <td className="px-3 py-2 font-mono">{e.delta.toFixed(3)}</td>
                <td className="px-3 py-2 font-mono">{e.modelCoverage.toFixed(3)}</td>
                <td className="px-3 py-2 font-mono">{e.peerAverageCoverage.toFixed(3)}</td>
                <td className="px-3 py-2">{e.rankAmongBases && e.totalBases ? `#${e.rankAmongBases} of ${e.totalBases}` : '—'}</td>
                <td className="px-3 py-2">{e.percentileFromTop !== undefined ? `${e.percentileFromTop}% from top (Q${e.quartileFromTop})` : '—'}</td>
                <td className="px-3 py-2">
                  {e.topBases && e.topBases.length > 0 ? (
                    <span className="font-mono">
                      {e.topBases.map((tb, i) => `${tb.base}:${tb.coverage.toFixed(2)}`).join(', ')}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="text-xs text-muted-foreground mb-1">
                    {e.systemPromptUsed ? (<span className="mr-2">sys</span>) : null}
                    {e.temperatureUsed !== null && e.temperatureUsed !== undefined ? (<span>temp: {e.temperatureUsed}</span>) : null}
                  </div>
                  <div className="max-h-32 overflow-auto border rounded p-2">
                    {typeof e.promptContext === 'string' ? (
                      <pre className="whitespace-pre-wrap text-xs">{e.promptContext}</pre>
                    ) : Array.isArray(e.promptContext) ? (
                      <div className="space-y-1 text-xs">
                        {e.promptContext.map((m: any, i: number) => (
                          <div key={i} className="border-b last:border-b-0 pb-1">
                            <span className="font-semibold mr-1">{m.role}:</span>
                            <span className="whitespace-pre-wrap">{m.content}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">(no prompt context)</span>
                    )}
                  </div>
                  <div className="mt-1">
                    <Link className="underline text-xs" href={`/analysis/${encodeURIComponent(e.configId)}/${encodeURIComponent(e.runLabel)}/${encodeURIComponent(e.timestamp)}`}>View full run</Link>
                  </div>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="max-h-32 overflow-auto border rounded p-2 text-xs whitespace-pre-wrap">
                    {e.finalResponse ?? '—'}
                  </div>
                </td>
                <td className="px-3 py-2">{e.configTitle}</td>
                <td className="px-3 py-2">{e.runLabel}</td>
                <td className="px-3 py-2">{new Date(fromSafeTimestamp(e.timestamp)).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
          </div>
        </div>
      </main>
      <SiteFooter contentMaxWidth="max-w-[1600px]" />
    </div>
  );
}


