'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatWorkshopId } from '@/lib/workshop-utils';
import { ArrowLeft, Copy, FileText, Users, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';

interface GalleryWeval {
  wevalId: string;
  workshopId: string;
  description: string;
  authorName: string;
  executionStatus: string;
  executionRunId: string | null;
  createdAt: string;
  promptCount: number;
}

interface GalleryResponse {
  workshopId: string;
  wevals: GalleryWeval[];
}

interface PageProps {
  params: Promise<{ workshopId: string }>;
}

export default function WorkshopGalleryPage({ params }: PageProps) {
  const { workshopId } = use(params);
  const router = useRouter();
  const [gallery, setGallery] = useState<GalleryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchGallery();
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchGallery, 10000);
    return () => clearInterval(interval);
  }, [workshopId]);

  const fetchGallery = async () => {
    try {
      const response = await fetch(`/api/workshop/${workshopId}/gallery`);
      if (!response.ok) {
        throw new Error('Failed to fetch gallery');
      }
      const data = await response.json();
      setGallery(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const copyWorkshopLink = () => {
    const url = `${window.location.origin}/workshop/${workshopId}`;
    navigator.clipboard.writeText(url);
  };

  const copyWevalLink = (wevalId: string) => {
    const url = `${window.location.origin}/workshop/${workshopId}/weval/${wevalId}`;
    navigator.clipboard.writeText(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading gallery...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="p-6 max-w-md">
          <p className="text-destructive mb-4">{error}</p>
          <Button onClick={() => router.push(`/workshop/${workshopId}`)}>
            Back to Workshop
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/workshop/${workshopId}`)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Builder
              </Button>
              <div className="h-6 w-px bg-border"></div>
              <h1 className="text-xl font-semibold">
                {formatWorkshopId(workshopId)} Gallery
              </h1>
            </div>
            <Button variant="outline" size="sm" onClick={copyWorkshopLink}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Workshop Link
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{gallery?.wevals.length || 0}</p>
                <p className="text-sm text-muted-foreground">Published Evaluations</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {gallery?.wevals.filter(w => w.executionStatus === 'complete').length || 0}
                </p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {new Set(gallery?.wevals.map(w => w.authorName)).size || 0}
                </p>
                <p className="text-sm text-muted-foreground">Contributors</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Evaluations */}
        {!gallery || gallery.wevals.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Evaluations Yet</h3>
            <p className="text-muted-foreground mb-4">
              Be the first to publish an evaluation to this workshop!
            </p>
            <Button onClick={() => router.push(`/workshop/${workshopId}`)}>
              Go to Builder
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {gallery.wevals.map((weval) => {
              const getStatusIcon = () => {
                if (weval.executionStatus === 'complete') {
                  return <CheckCircle className="h-4 w-4 text-green-600" />;
                } else if (weval.executionStatus === 'error') {
                  return <XCircle className="h-4 w-4 text-destructive" />;
                } else if (['pending', 'running', 'generating_responses', 'evaluating'].includes(weval.executionStatus)) {
                  return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
                } else {
                  return <Clock className="h-4 w-4 text-muted-foreground" />;
                }
              };

              const getStatusText = () => {
                if (weval.executionStatus === 'complete') return 'Complete';
                if (weval.executionStatus === 'error') return 'Failed';
                if (['pending', 'running', 'generating_responses', 'evaluating'].includes(weval.executionStatus)) return 'Running';
                return 'Unknown';
              };

              return (
                <Card
                  key={weval.wevalId}
                  className="p-6 hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => router.push(`/workshop/${workshopId}/weval/${weval.wevalId}`)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{weval.authorName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(weval.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyWevalLink(weval.wevalId);
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>

                  <p className="text-sm mb-4 line-clamp-3">{weval.description}</p>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      <span>{weval.promptCount} prompts</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {getStatusIcon()}
                      <span>{getStatusText()}</span>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(`/workshop/${workshopId}/weval/${weval.wevalId}`);
                    }}
                  >
                    View Evaluation
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
