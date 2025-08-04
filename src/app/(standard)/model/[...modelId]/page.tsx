import {
  getModelSummary,
} from '@/lib/storageService';
import { notFound } from 'next/navigation';
import { getModelDisplayLabel, parseModelIdForDisplay } from '@/app/utils/modelIdUtils';
import ClientDateTime from '@/app/components/ClientDateTime';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Metadata } from 'next';
import Icon from '@/components/ui/icon';

// This is the modelId from the URL, which is the "safe" version.
// We need to decode it if necessary, although our current safe ID is reversible.
type Props = {
  params: Promise<{ modelId: string[] }>;
};

// Helper to reconstruct model ID from URL slug parts
function getModelIdFromParams(params: { modelId: string[] }): string {
  return params.modelId.join('/');
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const modelId = getModelIdFromParams(await params);
  const summary = await getModelSummary(modelId);
  const displayName = getModelDisplayLabel(modelId);

  if (!summary) {
    return {
      title: 'Model Not Found',
    };
  }
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://weval.org';
  const title = `Performance Summary for ${displayName}`;
  const description = `Detailed evaluation results, performance metrics, strengths, and weaknesses for the ${displayName} model based on ${summary.overallStats.totalRuns} runs across ${summary.overallStats.totalBlueprints} blueprints.`;

  return {
    title: title,
    description: description,
    openGraph: {
      title: title,
      description: description,
      url: `${appUrl}/model/${modelId}`,
      images: [`${appUrl}/opengraph-image`],
    },
     twitter: {
      card: 'summary_large_image',
      title: title,
      description: description,
      images: [`${appUrl}/opengraph-image`],
    },
  };
}

export const revalidate = 3600; // Revalidate once per hour at most

export default async function ModelSummaryPage({ params }: Props) {
  const modelId = getModelIdFromParams(await params);
  const summary = await getModelSummary(modelId);

  if (!summary) {
    notFound();
  }

  const { displayName, provider } = summary;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{displayName}</h1>
        <div className="text-lg text-muted-foreground">
          Performance summary 
        </div>
         <p className="text-sm text-muted-foreground pt-2">
            Last updated: <ClientDateTime timestamp={summary.lastUpdated} />
        </p>
      </div>
      
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Avg. Hybrid Score</CardTitle>
                <Icon name="bar-chart-3" className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">
                {summary.overallStats.averageHybridScore !== null 
                    ? summary.overallStats.averageHybridScore.toFixed(3) 
                    : 'N/A'}
                </div>
                <p className="text-xs text-muted-foreground">Across all evaluations</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Evaluations</CardTitle>
                <Icon name="file-text" className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{summary.overallStats.totalRuns}</div>
                <p className="text-xs text-muted-foreground">Individual evaluation runs</p>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Unique Blueprints</CardTitle>
                <Icon name="layers" className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{summary.overallStats.totalBlueprints}</div>
                <p className="text-xs text-muted-foreground">Different test scenarios</p>
            </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="arrow-up-right" className="w-5 h-5 text-green-500" />
              Top Performing Blueprints (Strengths)
            </CardTitle>
            <CardDescription>Where this model scored highest on average.</CardDescription>
          </CardHeader>
          <CardContent>
             <ul className="space-y-3">
                {summary.strengthsAndWeaknesses.topPerforming.map(bp => (
                    <li key={bp.configId} className="flex justify-between items-center bg-muted/50 p-3 rounded-md">
                        <Link href={`/analysis/${bp.configId}`} className="hover:underline text-sm font-medium">
                            {bp.configTitle}
                        </Link>
                        <span className="font-bold text-green-600 dark:text-green-500">{bp.score.toFixed(3)}</span>
                    </li>
                ))}
             </ul>
          </CardContent>
        </Card>
         <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="arrow-down-right" className="w-5 h-5 text-red-500" />
              Weakest Performing Blueprints
            </CardTitle>
             <CardDescription>Where this model scored lowest on average.</CardDescription>
          </CardHeader>
          <CardContent>
             <ul className="space-y-3">
                {summary.strengthsAndWeaknesses.weakestPerforming.map(bp => (
                    <li key={bp.configId} className="flex justify-between items-center bg-muted/50 p-3 rounded-md">
                        <Link href={`/analysis/${bp.configId}`} className="hover:underline text-sm font-medium">
                            {bp.configTitle}
                        </Link>
                        <span className="font-bold text-red-600 dark:text-red-500">{bp.score.toFixed(3)}</span>
                    </li>
                ))}
             </ul>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
            <CardHeader>
                <CardTitle>All Evaluation Runs</CardTitle>
                 <CardDescription>Complete history of every evaluation this model participated in.</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Blueprint</TableHead>
                            <TableHead>Run</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Hybrid Score</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {summary.runs.map(run => (
                            <TableRow key={`${run.configId}-${run.runLabel}-${run.timestamp}`}>
                                <TableCell className="font-medium">
                                    <Link href={`/analysis/${run.configId}`} className="hover:underline">
                                        {run.configTitle}
                                    </Link>
                                </TableCell>
                                <TableCell>
                                    <Link href={`/analysis/${run.configId}/${run.runLabel}/${run.timestamp}`} className="hover:underline text-muted-foreground">
                                        {run.runLabel}
                                    </Link>
                                </TableCell>
                                <TableCell>
                                    <ClientDateTime timestamp={run.timestamp} />
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                    {run.hybridScore !== null ? run.hybridScore.toFixed(4) : 'N/A'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
      </section>

    </div>
  );
} 