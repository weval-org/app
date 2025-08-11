import Link from 'next/link';
import { listModelCards } from '@/lib/storageService';

export default async function ModelCardsIndexPage() {
  const modelCardIds = await listModelCards();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Model Cards</h1>
          <p className="text-muted-foreground">
            Comprehensive analysis and performance summaries for AI models
          </p>
        </div>

        {modelCardIds.length === 0 ? (
          <div className="bg-card p-8 rounded-lg text-center">
            <h2 className="text-xl font-semibold mb-4">No Model Cards Available</h2>
            <p className="text-muted-foreground mb-4">
              No model cards have been generated yet. Create model cards using the CLI command:
            </p>
            <code className="bg-muted px-3 py-1 rounded text-sm">
              pnpm cli generate-model-card "model-pattern"
            </code>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {modelCardIds.map((modelId) => {
              // Convert safe model ID back to readable format
              const displayId = modelId.replace(/_/g, ':');
              const urlSafeId = encodeURIComponent(modelId);
              
              return (
                <Link
                  key={modelId}
                  href={`/cards/${urlSafeId}`}
                  className="bg-card p-6 rounded-lg border border-border hover:border-primary transition-colors"
                >
                  <h3 className="font-semibold mb-2 truncate">{displayId}</h3>
                  <p className="text-sm text-muted-foreground">
                    View detailed performance analysis
                  </p>
                  <div className="mt-4 text-xs text-primary">
                    View Card →
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="text-primary hover:underline"
          >
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
} 