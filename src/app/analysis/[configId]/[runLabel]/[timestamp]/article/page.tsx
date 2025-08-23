import { cache } from 'react';
import { notFound } from 'next/navigation';
import { getCoreResult, getResultByFileName } from '@/lib/storageService';
import { WevalResult } from '@/types/shared';
import Link from 'next/link';
import { ArticleClient } from './ArticleClient';

type ThisPageProps = {
  params: Promise<{ configId: string; runLabel: string; timestamp: string }>
};

const getRunData = cache(async (params: ThisPageProps['params']): Promise<WevalResult> => {
  const { configId, runLabel, timestamp } = await params;
  try {
    const core = await getCoreResult(configId, runLabel, timestamp);
    if (core) return core as WevalResult;
    const fileName = `${runLabel}_${timestamp}_comparison.json`;
    const jsonData = await getResultByFileName(configId, fileName);
    if (!jsonData) notFound();
    return jsonData as WevalResult;
  } catch (e) {
    notFound();
  }
});

export default async function ArticlePage(props: ThisPageProps) {
  const data = await getRunData(props.params);
  const article = data.article;

  if (!article) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-2xl font-bold mb-2">No Article Available</h1>
        <p className="text-muted-foreground mb-4">This run does not yet have a published article.</p>
        <div className="text-sm">
          <p>To generate one, run the CLI backfill:</p>
          <pre className="mt-2 bg-muted p-3 rounded text-xs overflow-auto">
{`pnpm cli backfill-article ${data.configId}/${data.runLabel}/${data.timestamp}`}
          </pre>
          <p className="mt-3">
            Or return to the <Link className="underline" href={`/analysis/${data.configId}/${data.runLabel}/${data.timestamp}`}>analysis overview</Link>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ArticleClient
      configId={data.configId}
      runLabel={data.runLabel}
      timestamp={data.timestamp}
      title={article.title}
      deck={article.deck}
      content={article.content}
      readingTimeMin={article.meta?.readingTimeMin}
    />
  );
}


