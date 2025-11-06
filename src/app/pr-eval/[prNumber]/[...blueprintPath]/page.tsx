'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface PRMetadata {
  prNumber: number;
  blueprintPath: string;
  commitSha: string;
  author: string;
  runId: string;
  startedAt: string;
}

interface EvalStatus {
  status: 'pending' | 'validating' | 'generating_responses' | 'evaluating' | 'running_pipeline' | 'saving' | 'complete' | 'error';
  message: string;
  updatedAt: string;
  progress?: {
    completed: number;
    total: number;
  };
  error?: string;
  stack?: string;
  completedAt?: string;
  resultUrl?: string;
}

interface EvalData {
  prNumber: number;
  blueprintPath: string;
  metadata: PRMetadata | null;
  status: EvalStatus | null;
  blueprint: string | null;
  results: any | null;
}

const STATUS_DISPLAY = {
  pending: { label: 'Starting...', color: 'text-blue-600', icon: '⏳' },
  validating: { label: 'Validating', color: 'text-yellow-600', icon: '🔍' },
  generating_responses: { label: 'Generating Responses', color: 'text-purple-600', icon: '🤖' },
  evaluating: { label: 'Evaluating', color: 'text-indigo-600', icon: '📊' },
  running_pipeline: { label: 'Running Evaluation', color: 'text-indigo-600', icon: '⚡' },
  saving: { label: 'Saving Results', color: 'text-green-600', icon: '💾' },
  complete: { label: 'Complete', color: 'text-green-600', icon: '✅' },
  error: { label: 'Error', color: 'text-red-600', icon: '❌' },
};

/**
 * Generate PR-specific config ID for analysis page routing
 * Format: _pr_{prNumber}_{sanitized}
 *
 * Handles multiple possible blueprintPath formats:
 * - blueprints/users/padolsey/art-appreciation-and-analysis
 * - padolsey/art-appreciation-and-analysis
 * - blueprints/users/padolsey/art-appreciation-and-analysis.yml
 */
function generatePRConfigId(prNumber: string, blueprintPath: string): string {
  let sanitized = blueprintPath;

  // Remove 'blueprints/users/' prefix if present
  if (sanitized.startsWith('blueprints/users/')) {
    sanitized = sanitized.substring('blueprints/users/'.length);
  }
  // Also handle 'blueprints/' prefix alone
  else if (sanitized.startsWith('blueprints/')) {
    sanitized = sanitized.substring('blueprints/'.length);
  }

  // Remove .yml or .yaml extension
  sanitized = sanitized.replace(/\.ya?ml$/, '');

  // Replace remaining slashes with dashes
  sanitized = sanitized.replace(/\//g, '-');

  return `_pr_${prNumber}_${sanitized}`;
}

export default function PREvaluationPage() {
  const params = useParams();
  const prNumber = params.prNumber as string;
  const blueprintPathArray = params.blueprintPath as string[];
  const blueprintPath = blueprintPathArray.join('/');

  const [data, setData] = useState<EvalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const url = `/api/pr-eval/${prNumber}/${blueprintPath}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          setError('Evaluation not found. It may not have started yet.');
        } else {
          setError(`Failed to fetch evaluation data: ${response.statusText}`);
        }
        setLoading(false);
        return;
      }

      const result = await response.json();
      setData(result);
      setError(null);
      setLoading(false);
    } catch (err: any) {
      console.error('[PR Eval Page] Error fetching data:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [prNumber, blueprintPath]);

  // Poll for updates while evaluation is running
  useEffect(() => {
    if (!data?.status) return;

    const isRunning = !['complete', 'error'].includes(data.status.status);
    if (!isRunning) return;

    const interval = setInterval(() => {
      fetchData();
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [data?.status?.status]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading evaluation status...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-md p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Link
              href="/"
              className="inline-block px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Go Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const statusInfo = data.status ? STATUS_DISPLAY[data.status.status] : null;
  const isComplete = data.status?.status === 'complete';
  const isError = data.status?.status === 'error';

  // Generate the correct PR-specific configId for analysis page routing
  // This ensures the analysis page can find the data in live/pr-evals/ location
  const prConfigId = generatePRConfigId(prNumber, blueprintPath);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                PR #{prNumber} Evaluation
              </h1>
              <p className="text-gray-600 font-mono text-sm mb-4">
                {data.blueprintPath}
              </p>
              {data.metadata && (
                <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                  <div>
                    <span className="font-semibold">Author:</span> {data.metadata.author}
                  </div>
                  <div>
                    <span className="font-semibold">Commit:</span>{' '}
                    <code className="bg-gray-100 px-2 py-1 rounded">
                      {data.metadata.commitSha?.substring(0, 7)}
                    </code>
                  </div>
                  <div>
                    <span className="font-semibold">Started:</span>{' '}
                    {new Date(data.metadata.startedAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
            <Link
              href={`https://github.com/${process.env.NEXT_PUBLIC_GITHUB_REPO || 'weval-org/configs'}/pull/${prNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors text-sm font-medium"
            >
              View PR on GitHub →
            </Link>
          </div>
        </div>

        {/* Status */}
        {data.status && statusInfo && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="text-4xl">{statusInfo.icon}</div>
              <div>
                <h2 className={`text-2xl font-bold ${statusInfo.color}`}>
                  {statusInfo.label}
                </h2>
                <p className="text-gray-600">{data.status.message}</p>
              </div>
            </div>

            {/* Progress bar for generating responses */}
            {data.status.progress && data.status.progress.total > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Progress</span>
                  <span>
                    {data.status.progress.completed} / {data.status.progress.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{
                      width: `${(data.status.progress.completed / data.status.progress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Error details */}
            {isError && data.status.error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="font-semibold text-red-800 mb-2">Error Details:</p>
                <p className="text-red-700 font-mono text-sm">{data.status.error}</p>
              </div>
            )}

            {/* Completion time */}
            {isComplete && data.status.completedAt && (
              <div className="mt-4 text-sm text-gray-600">
                <span className="font-semibold">Completed:</span>{' '}
                {new Date(data.status.completedAt).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {isComplete && data.results && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Results Summary</h2>
              <Link
                href={`/analysis/${prConfigId}`}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-medium inline-flex items-center gap-2"
              >
                <span>View Full Analysis</span>
                <span>→</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Models Evaluated</div>
                <div className="text-3xl font-bold text-gray-900">
                  {data.results.effectiveModels?.length || 0}
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Total Prompts</div>
                <div className="text-3xl font-bold text-gray-900">
                  {data.results.promptIds?.length || 0}
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Total Responses</div>
                <div className="text-3xl font-bold text-gray-900">
                  {data.results.allFinalAssistantResponses
                    ? Object.values(data.results.allFinalAssistantResponses).reduce((sum: number, responses: any) => sum + Object.keys(responses).length, 0)
                    : 0}
                </div>
              </div>
            </div>

            <div className="prose max-w-none">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Blueprint Details</h3>
              <dl className="grid grid-cols-1 gap-2 text-sm">
                {(data.results.configTitle || data.results.config?.title) && (
                  <>
                    <dt className="font-semibold text-gray-700">Title:</dt>
                    <dd className="text-gray-900">{data.results.configTitle || data.results.config?.title}</dd>
                  </>
                )}
                {data.results.description || data.results.config?.description && (
                  <>
                    <dt className="font-semibold text-gray-700">Description:</dt>
                    <dd className="text-gray-900">{data.results.description || data.results.config?.description}</dd>
                  </>
                )}
                {(data.results.config?.tags && data.results.config.tags.length > 0) && (
                  <>
                    <dt className="font-semibold text-gray-700">Tags:</dt>
                    <dd className="flex flex-wrap gap-2">
                      {data.results.config.tags.map((tag: string, i: number) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                    </dd>
                  </>
                )}
              </dl>
            </div>

            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-semibold mb-2">
                ✅ Evaluation completed successfully!
              </p>
              <p className="text-green-700 text-sm mb-3">
                The blueprint has been validated and evaluated against all configured models.
              </p>
              <Link
                href={`/analysis/${prConfigId}`}
                className="inline-block px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium transition-colors"
              >
                View Full Analysis & Scores →
              </Link>
            </div>
          </div>
        )}

        {/* Blueprint YAML */}
        {data.blueprint && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Blueprint YAML</h2>
            <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
              <code>{data.blueprint}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
