'use client';

import React, { useState, useEffect } from 'react';
import { PainPointsSummary, PainPoint } from '@/types/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import Link from 'next/link';
import ClientDateTime from '@/app/components/ClientDateTime';
import { Badge } from '@/components/ui/badge';
import { ChevronDown } from 'lucide-react';

const PainPointsClientPage = () => {
  const [summary, setSummary] = useState<PainPointsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPainPoints = async () => {
      try {
        const res = await fetch('/api/pain-points');
        if (!res.ok) {
          throw new Error('Failed to fetch data');
        }
        const data = await res.json();
        setSummary(data);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchPainPoints();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!summary || summary.painPoints.length === 0) {
    return (
      <Alert>
        <AlertTitle>No Pain Points Found</AlertTitle>
        <AlertDescription>
          No significant model failures were found in the latest evaluation
          runs.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Pain Points</h1>
        <p className="text-sm text-muted-foreground">
          Last generated:{' '}
          {summary.generatedAt ? (
            <ClientDateTime timestamp={summary.generatedAt} />
          ) : (
            'N/A'
          )}
        </p>
      </div>
      <p className="text-muted-foreground">
        A list of the most significant model failures, ranked by severity.
      </p>
      <div className="w-full space-y-2">
        {summary.painPoints.map((point, index) => (
          <PainPointItem key={index} point={point} />
        ))}
      </div>
    </div>
  );
};

const PainPointItem = ({ point }: { point: PainPoint }) => {
  const [isOpen, setIsOpen] = useState(false);
  const modelName = getModelDisplayLabel(point.modelId);
  const deepLink = `/redlines/${encodeURIComponent(point.configId)}/${encodeURIComponent(point.runLabel)}/${encodeURIComponent(point.timestamp)}/${encodeURIComponent(point.promptId)}/${encodeURIComponent(point.modelId)}`;

  return (
    <div className="border rounded-md">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex justify-between w-full p-4 text-left items-center"
      >
        <div className="flex-1 truncate">
          <span className="truncate">
            <Badge variant="destructive" className="mr-2">
              {(point.coverageScore * 100).toFixed(0)}%
            </Badge>
            {point.configTitle}
          </span>
        </div>
        <div className="flex items-center">
          <span className="text-muted-foreground mr-4">{modelName}</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>
      {isOpen && (
        <div className="p-4 border-t">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-lg">
                  <Link
                    href={`/analysis/${point.configId}/${point.runLabel}/${point.timestamp}`}
                    className="hover:underline"
                  >
                    {point.configTitle}
                  </Link>
                </CardTitle>
                <Link href={deepLink}>
                  <Button size="sm" variant="secondary">Deep dive</Button>
                </Link>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>
                  <strong>Model:</strong> {modelName}
                </p>
                <p>
                  <strong>Prompt:</strong> {point.promptId}
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Prompt</h3>
                <div className="prose prose-sm dark:prose-invert bg-muted rounded p-4">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {Array.isArray(point.promptContext)
                      ? point.promptContext
                          .map((m) => `**${m.role}:**\n\n${m.content}`)
                          .join('\n\n---\n\n')
                      : String(point.promptContext)}
                  </ReactMarkdown>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Model Response</h3>
                <div className="prose prose-sm dark:prose-invert bg-muted rounded p-4">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {point.responseText}
                  </ReactMarkdown>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Failed Criteria</h3>
                <ul className="space-y-2">
                  {point.failedCriteria.map((c, i) => (
                    <li key={i} className="p-2 border rounded">
                      <p>
                        <strong>Criterion:</strong> {c.criterion}
                      </p>
                      <p>
                        <strong>Score:</strong>{' '}
                        <span className="font-mono">
                          {c.score?.toFixed(2) ?? 'N/A'}
                        </span>
                      </p>
                      {c.reflection && (
                        <p className="text-sm text-muted-foreground mt-1">
                          <strong>Judge&apos;s Reflection:</strong>{' '}
                          {c.reflection}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default PainPointsClientPage;
