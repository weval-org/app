import React from 'react';
import Link from 'next/link';
import { getNDeltasIndex } from '@/lib/storageService';
import { SiteHeader } from '@/app/components/SiteHeader';
import { SiteFooter } from '@/app/components/SiteFooter';

export const metadata = {
  title: 'NDeltas – Weak Points Index',
};

export default async function NDeltasIndexPage() {
  const index = await getNDeltasIndex();
  return (
    <div className="flex flex-col min-h-screen">
      <SiteHeader contentMaxWidth="max-w-[1600px]" />
      <main className="flex-grow w-full bg-background text-foreground">
        <div className="mx-auto max-w-[1600px] px-4 py-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Model Weak Points (NDeltas)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Compare models by their most negative deltas: prompts where a model underperforms the peer average
              after aggregating all its system/temperature variants. Click a model to see its detailed table.
            </p>
          </div>

          {!index || index.models.length === 0 ? (
            <div className="rounded-md border p-4 text-sm text-muted-foreground">
              No NDeltas index found. Run the CLI in all-models mode to generate it, e.g.
              <code className="ml-2">pnpm cli generate-ndeltas --all-models --min-runs 3 --min-peers 2</code>
            </div>
          ) : (
            <div className="overflow-x-auto border rounded-md">
              <table className="min-w-full text-sm">
                <thead className="bg-muted sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-3 py-2">Model</th>
                    <th className="text-left px-3 py-2">Worst Δ</th>
                    <th className="text-left px-3 py-2">Median Δ</th>
                    <th className="text-left px-3 py-2">Entries</th>
                    <th className="text-left px-3 py-2">Generated</th>
                    <th className="text-left px-3 py-2">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {index.models.map(m => (
                    <tr key={m.modelId}>
                      <td className="px-3 py-2 font-mono">{m.modelId}</td>
                      <td className="px-3 py-2 font-mono">{m.worstDelta !== null ? m.worstDelta.toFixed(3) : '—'}</td>
                      <td className="px-3 py-2 font-mono">{m.medianDelta !== null && m.medianDelta !== undefined ? m.medianDelta.toFixed(3) : '—'}</td>
                      <td className="px-3 py-2">{m.totalEntries}</td>
                      <td className="px-3 py-2">{new Date(m.generatedAt).toLocaleString()}</td>
                      <td className="px-3 py-2"><Link className="underline" href={`/ndeltas/${encodeURIComponent(m.modelId)}`}>View details</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground px-3 py-2">Last updated: {new Date(index.lastUpdated).toLocaleString()}</p>
            </div>
          )}
        </div>
      </main>
      <SiteFooter contentMaxWidth="max-w-[1600px]" />
    </div>
  );
}


