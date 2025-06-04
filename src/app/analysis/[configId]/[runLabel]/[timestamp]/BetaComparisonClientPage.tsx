'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import SimilarityHeatmap from '@/app/analysis/components/SimilarityHeatmap'
import SimilarityGraph from '@/app/analysis/components/SimilarityGraph'
import DendrogramChart from '@/app/analysis/components/DendrogramChart'
import { ResponseComparisonModal } from '@/app/analysis/components/ResponseComparisonModal'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { findIdealExtremes } from '@/app/utils/similarityUtils'
import KeyPointCoverageTable from '@/app/analysis/components/KeyPointCoverageTable'
import MacroCoverageTable from '@/app/analysis/components/MacroCoverageTable'
import DatasetStatistics from '@/app/analysis/components/DatasetStatistics'
import KeyPointCoverageComparisonDisplay from '@/app/analysis/components/KeyPointCoverageComparisonDisplay'
import SemanticExtremesDisplay from '@/app/analysis/components/SemanticExtremesDisplay'
import {
    ComparisonDataV2 as ImportedComparisonDataV2,
    SelectedPairInfo as ImportedSelectedPairInfo
} from '@/app/utils/types';
import {
    IDEAL_MODEL_ID,
    calculateOverallCoverageExtremes as importedCalculateOverallCoverageExtremes,
    calculateHybridScoreExtremes as importedCalculateHybridScoreExtremes,
    calculateOverallAverageCoverage as importedCalculateOverallAverageCoverage,
    calculateAverageHybridScoreForRun as importedCalculateAverageHybridScoreForRun
} from '@/app/utils/comparisonUtils';

import { useTheme } from 'next-themes';
import DownloadResultsButton from '@/app/analysis/components/DownloadResultsButton';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import PerModelHybridScoresCard from '@/app/analysis/components/PerModelHybridScoresCard';
import AnalysisPageHeader from '@/app/analysis/components/AnalysisPageHeader';
import { fromSafeTimestamp, formatTimestampForDisplay } from '@/app/utils/timestampUtils';
import ModelEvaluationDetailModal from '@/app/analysis/components/ModelEvaluationDetailModal';
import DebugPanel from '@/app/analysis/components/DebugPanel';

const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle))
const XCircle = dynamic(() => import("lucide-react").then((mod) => mod.XCircle))
const Loader2 = dynamic(() => import("lucide-react").then((mod) => mod.Loader2))
const HelpCircle = dynamic(() => import("lucide-react").then(mod => mod.HelpCircle))
const SlidersHorizontal = dynamic(() => import("lucide-react").then(mod => mod.SlidersHorizontal))
const BarChartBig = dynamic(() => import("lucide-react").then(mod => mod.BarChartBig))
const Eye = dynamic(() => import("lucide-react").then(mod => mod.Eye))

interface LLMCoverageScoreData {
    keyPointsCount: number;
    avgCoverageExtent?: number;
    pointAssessments?: PointAssessment[];
}

interface PointAssessment {
    keyPointText: string;
    coverageExtent?: number;
    reflection?: string;
    error?: string;
}

// Updated data structure for the Model Evaluation Detail Modal
interface ModelEvaluationDetailModalData {
  modelId: string;
  assessments: PointAssessment[]; // Changed from single assessment
  promptText: string;
  modelResponse: string;
  systemPrompt: string | null;
}

type CoverageResult = (LLMCoverageScoreData & { pointAssessments?: PointAssessment[] }) | { error: string } | null;

export default function BetaComparisonClientPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  
  const configIdFromUrl = params.configId as string;
  const runLabel = params.runLabel as string;
  const timestampFromUrl = params.timestamp as string;

  const currentPromptId = searchParams.get('prompt');
  const { resolvedTheme } = useTheme();

  const [data, setData] = useState<ImportedComparisonDataV2 | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [promptNotFound, setPromptNotFound] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedPairForModal, setSelectedPairForModal] = useState<ImportedSelectedPairInfo | null>(null);
  const [modelSystemPrompts, setModelSystemPrompts] = useState<Record<string, string | null>>({});
  const [displayedModels, setDisplayedModels] = useState<string[]>([]);
  const [excludedModelsList, setExcludedModelsList] = useState<string[]>([]);
  const [overallIdealExtremes, setOverallIdealExtremes] = useState<ReturnType<typeof findIdealExtremes> | null>(null);
  const [overallAvgCoverageStats, setOverallAvgCoverageStats] = useState<{average: number | null, stddev: number | null} | null>(null);
  const [overallCoverageExtremes, setOverallCoverageExtremes] = useState<ReturnType<typeof importedCalculateOverallCoverageExtremes> | null>(null);
  const [overallHybridExtremes, setOverallHybridExtremes] = useState<ReturnType<typeof importedCalculateHybridScoreExtremes> | null>(null);
  const [overallAverageHybridScore, setOverallAverageHybridScore] = useState<number | null>(null);
  const [overallHybridScoreStdDev, setOverallHybridScoreStdDev] = useState<number | null>(null);
  const [calculatedPerModelHybridScores, setCalculatedPerModelHybridScores] = useState<Map<string, { average: number | null; stddev: number | null }>>(new Map());
  const [calculatedPerModelSemanticScores, setCalculatedPerModelSemanticScores] = useState<Map<string, { average: number | null; stddev: number | null }>>(new Map());
  
  // Updated state for the Model Evaluation Detail Modal
  const [modelEvaluationDetailModalData, setModelEvaluationDetailModalData] = useState<ModelEvaluationDetailModalData | null>(null);
  const [isModelEvaluationDetailModalOpen, setIsModelEvaluationDetailModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        setPromptNotFound(false);
        const response = await fetch(`/api/comparison/${configIdFromUrl}/${runLabel}/${timestampFromUrl}`)
        
        if (!response.ok) {
          throw new Error(`Failed to fetch comparison data: ${response.statusText} for ${configIdFromUrl}/${runLabel}/${timestampFromUrl}`)
        }
        
        const result: ImportedComparisonDataV2 = await response.json()
        setData(result)
        setModelSystemPrompts(result.modelSystemPrompts || {});
        
        const excludedFromData = result.excludedModels || [];
        const modelsWithEmptyResponses = new Set<string>(excludedFromData);

        if (result.allResponses && result.effectiveModels) {
          result.effectiveModels.forEach((modelId: string) => {
            if (modelsWithEmptyResponses.has(modelId)) return;
            for (const promptId in result.allResponses) {
              const responseText = result.allResponses[promptId]?.[modelId];
              if (responseText === undefined || responseText.trim() === '') {
                modelsWithEmptyResponses.add(modelId);
                break;
              }
            }
          });
        }

        const finalExcluded = Array.from(modelsWithEmptyResponses);
        const finalDisplayed = (result.effectiveModels || []).filter((m: string) => !modelsWithEmptyResponses.has(m));

        setExcludedModelsList(finalExcluded);
        setDisplayedModels(finalDisplayed);
        
        if (currentPromptId && result.promptIds && !result.promptIds.includes(currentPromptId)) {
          setPromptNotFound(true);
        }
        
        if (result.evaluationResults?.similarityMatrix && result.effectiveModels) {
            const idealExtremes = findIdealExtremes(result.evaluationResults.similarityMatrix, IDEAL_MODEL_ID);
            setOverallIdealExtremes(idealExtremes);
        } else {
            setOverallIdealExtremes({ mostSimilar: null, leastSimilar: null });
        }
        
        if (result.evaluationResults?.llmCoverageScores && result.effectiveModels) {
            const coverageExtremes = importedCalculateOverallCoverageExtremes(result.evaluationResults.llmCoverageScores, result.effectiveModels);
            setOverallCoverageExtremes(coverageExtremes);
            
            if (result.promptIds) {
                const avgCoverageStats = importedCalculateOverallAverageCoverage(
                    result.evaluationResults.llmCoverageScores, 
                    result.effectiveModels, 
                    result.promptIds
                );
                setOverallAvgCoverageStats(avgCoverageStats);
            } else {
                setOverallAvgCoverageStats(null);
            }
        } else {
            setOverallCoverageExtremes({ bestCoverage: null, worstCoverage: null });
            setOverallAvgCoverageStats(null);
        }
        
        if (result.evaluationResults?.perPromptSimilarities && result.evaluationResults?.llmCoverageScores && result.effectiveModels) {
          const hybridExtremes = importedCalculateHybridScoreExtremes(
              result.evaluationResults.perPromptSimilarities,
              result.evaluationResults.llmCoverageScores,
              result.effectiveModels,
              IDEAL_MODEL_ID
          );
          setOverallHybridExtremes(hybridExtremes);

          if (result.evaluationResults?.perPromptSimilarities && 
              result.evaluationResults?.llmCoverageScores && 
              result.effectiveModels && 
              result.promptIds) {
            const hybridStats = importedCalculateAverageHybridScoreForRun(
              result.evaluationResults.perPromptSimilarities,
              result.evaluationResults.llmCoverageScores,
              result.effectiveModels,
              result.promptIds,
              IDEAL_MODEL_ID
            );
            setOverallAverageHybridScore(hybridStats?.average ?? null);
            setOverallHybridScoreStdDev(hybridStats?.stddev ?? null);
          } else {
            setOverallAverageHybridScore(null);
            setOverallHybridScoreStdDev(null);
          }
        } else {
            setOverallHybridExtremes({ bestHybrid: null, worstHybrid: null });
        }

        // Use pre-calculated perModelHybridScores if available from API response
        if (result.evaluationResults?.perModelHybridScores) {
          let scoresToSet = result.evaluationResults.perModelHybridScores;
          // Re-hydrate if it's an object (from JSON response)
          if (typeof scoresToSet === 'object' && !(scoresToSet instanceof Map)) {
            scoresToSet = new Map(Object.entries(scoresToSet));
          }
          setCalculatedPerModelHybridScores(scoresToSet as Map<string, { average: number | null; stddev: number | null }>);
        } else {
          // Fallback or clear if not provided - though ideally it should always be calculated by the API now
          setCalculatedPerModelHybridScores(new Map());
        }
        
        // Use pre-calculated per-model semantic scores from API if available
        if (result.evaluationResults?.perModelSemanticScores) {
          let scoresToSet = result.evaluationResults.perModelSemanticScores;
          if (typeof scoresToSet === 'object' && !(scoresToSet instanceof Map)) {
            scoresToSet = new Map(Object.entries(scoresToSet));
          }
          setCalculatedPerModelSemanticScores(scoresToSet as Map<string, { average: number | null; stddev: number | null }>);
        } else {
          // Fallback or clear if not provided - though ideally it should always be calculated by the API now
          console.warn("API did not provide perModelSemanticScores. Ensure API calculates this.");
          setCalculatedPerModelSemanticScores(new Map());
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred')
        console.error(`Error fetching comparison data for ${configIdFromUrl}/${runLabel}/${timestampFromUrl}:`, err)
      } finally {
        setLoading(false)
      }
    }

    if (configIdFromUrl && runLabel && timestampFromUrl) {
      fetchData()
    }
  }, [configIdFromUrl, runLabel, timestampFromUrl, currentPromptId])

  const matrixForCurrentView = useMemo(() => data && 
    ((!currentPromptId
    ? data.evaluationResults?.similarityMatrix
    : data.evaluationResults?.perPromptSimilarities?.[currentPromptId]) ?? {}), [data, currentPromptId]);

  const safeMatrixForCurrentView = useMemo(() => {
    const matrix: Record<string, Record<string, number>> = {};
    const modelsToUse = displayedModels ?? [];

    modelsToUse.forEach(m1 => {
      matrix[m1] = {};
    });

    modelsToUse.forEach(m1 => {
      modelsToUse.forEach(m2 => {
        if (m1 === m2) {
          matrix[m1][m2] = 1.0;
          return;
        }

        const sim = matrixForCurrentView?.[m1]?.[m2];

        if (sim === null) {
          matrix[m1][m2] = NaN;
        } else if (typeof sim === 'number' && !isNaN(sim)) {
          matrix[m1][m2] = sim;
        } else {
          matrix[m1][m2] = NaN;
        }
      });
    });

    modelsToUse.forEach(m1 => {
      modelsToUse.forEach(m2 => {
        if (m1 === m2) return;

        const val1 = matrix[m1]?.[m2];
        const val2 = matrix[m2]?.[m1];

        if (isNaN(val1) && !isNaN(val2)) {
          matrix[m1][m2] = val2;
        } else if (!isNaN(val1) && isNaN(val2)) {
          matrix[m2][m1] = val1;
        } else if (val1 !== val2) {
           if (!isNaN(val1) && !isNaN(val2)){
              matrix[m2][m1] = val1;
           }
        }
      });
    });
    return matrix;
  }, [matrixForCurrentView, displayedModels]);

  const overallAvgCoverage = useMemo(() => {
    if (!data?.evaluationResults?.llmCoverageScores || !data?.promptIds || !data?.effectiveModels) {
      return null;
    }
    return importedCalculateOverallAverageCoverage(
      data.evaluationResults.llmCoverageScores,
      data.effectiveModels.filter(m => m !== IDEAL_MODEL_ID),
      data.promptIds
    );
  }, [data]);

  const modelsToDisplayInGraphs = useMemo(() => {
    if (!currentPromptId || !data || !displayedModels.length || !safeMatrixForCurrentView) {
        return displayedModels;
    }
    const validModelsForPromptView = displayedModels.filter(modelId => {
        if (displayedModels.length <= 1) return true;
        const modelSims = safeMatrixForCurrentView[modelId];
        if (!modelSims) return false; 
        return displayedModels.some(otherModelId => {
            if (modelId === otherModelId) return false;
            const simScore = modelSims[otherModelId];
            return typeof simScore === 'number' && !isNaN(simScore);
        });
    });
    if (currentPromptId && displayedModels.length > 0 && validModelsForPromptView.length === 0) {
        return displayedModels;
    }
    return validModelsForPromptView;
  }, [currentPromptId, data, displayedModels, safeMatrixForCurrentView]);

  const getPromptText = (promptId: string): string => {
    return data?.promptTexts?.[promptId] || promptId;
  };
  
  let pageTitle = "Analysis";
  // Calculate pageTitle based on data, timestampFromUrl, currentPromptId
  if (data) {
    pageTitle = `${data.configTitle || configIdFromUrl} - ${data.runLabel || runLabel}`;
    if (timestampFromUrl) {
      pageTitle += ` (${formatTimestampForDisplay(timestampFromUrl)})`;
    }
  } else if (configIdFromUrl && runLabel && timestampFromUrl) {
    // Fallback if data is not yet loaded but params are available
    pageTitle = `${configIdFromUrl} - ${runLabel}`;
    pageTitle += ` (${formatTimestampForDisplay(timestampFromUrl)})`;
  }

  if (currentPromptId) {
    pageTitle += ` - Prompt: ${currentPromptId}`;
  }

  const breadcrumbItems = useMemo(() => {
    const items = [
      { label: 'Home', href: '/' },
      {
        label: data?.configTitle || configIdFromUrl,
        href: `/analysis/${configIdFromUrl}`
      },
      {
        label: data?.runLabel || runLabel,
        href: `/analysis/${configIdFromUrl}/${runLabel}`
      },
      {
        label: timestampFromUrl ? formatTimestampForDisplay(timestampFromUrl) : "Instance",
        ...(currentPromptId ? { href: `/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}` } : {})
      }
    ];
    if (currentPromptId) {
      items.push({ label: `Prompt: ${currentPromptId}` });
    }
    return items;
  }, [data, configIdFromUrl, runLabel, timestampFromUrl, currentPromptId]);

  const headerActions = useMemo(() => (
    data ? <DownloadResultsButton data={data} label={`${data.configTitle || configIdFromUrl} - ${data.runLabel || runLabel}${timestampFromUrl ? ' (' + new Date(fromSafeTimestamp(timestampFromUrl)).toLocaleString() + ')' : ''}`} /> : null
  ), [data, configIdFromUrl, runLabel, timestampFromUrl]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-8">
        <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
        <div className="flex items-center space-x-3 text-xl text-foreground dark:text-slate-200">
          {Loader2 && <Loader2 className="animate-spin h-8 w-8 text-primary dark:text-sky-400" />}
          <span>Loading analysis for "<strong className='text-primary dark:text-sky-300'>{pageTitle}</strong>"... Please wait.</span>
        </div>
      </div>
    );
  }
  
  if (error) {
    const isNoRealDataError = error.includes("No real comparison data found");
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-8">
        <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
        <div className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md p-8 rounded-xl shadow-lg ring-1 ring-destructive/70 dark:ring-red-500/70 text-center max-w-lg w-full">
            {XCircle && <XCircle className="w-16 h-16 mx-auto mb-4 text-destructive dark:text-red-400" />}
            <h2 className="text-2xl font-semibold mb-3 text-destructive dark:text-red-300">Error Loading Analysis</h2>
            <p className="text-card-foreground dark:text-slate-300 mb-4">Could not load data for: <strong className="text-card-foreground dark:text-slate-100">{pageTitle}</strong></p>
            <div className="text-sm text-muted-foreground dark:text-slate-400 bg-muted/70 dark:bg-slate-700/50 p-4 rounded-md ring-1 ring-border dark:ring-slate-600 mb-6">
                <p className="font-semibold text-card-foreground dark:text-slate-300 mb-1">Error Details:</p>
                {error}
            </div>
            
            {isNoRealDataError ? (
              <div className="mt-4 text-left text-sm text-muted-foreground dark:text-slate-400">
                <p className="mb-2 font-medium text-card-foreground dark:text-slate-300">To generate blueprint data:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Ensure you have run the <code className="text-xs bg-muted dark:bg-slate-700 p-0.5 rounded">embed_multi</code> command (or similar embedding generation).</li>
                  <li>Then, use the <code className="text-xs bg-muted dark:bg-slate-700 p-0.5 rounded">compare_multi</code> command on the resulting files.</li>
                  <li>Alternatively, use the unified <code className="text-xs bg-muted dark:bg-slate-700 p-0.5 rounded">run_config</code> command with a valid blueprint file.</li>
                </ol>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground dark:text-slate-400">
                This could be due to an incorrect blueprint ID/run label, an issue with the data file, or a server problem.
              </p>
            )}
            <Button onClick={() => router.push('/')} variant="default" className="mt-8 w-full sm:w-auto px-6 py-2.5">
                Go to Homepage
            </Button>
        </div>
      </div>
    );
  }
  
  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-8">
        <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
        <div className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md p-8 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 text-center max-w-md w-full">
            {HelpCircle && <HelpCircle className="w-16 h-16 mx-auto mb-4 text-primary dark:text-sky-400" />}
            <h2 className="text-2xl font-semibold mb-3 text-card-foreground dark:text-slate-100">No Data Available</h2>
            <p className="text-card-foreground dark:text-slate-300 mb-2">No comparison data found for: <strong className="text-card-foreground dark:text-slate-100">{pageTitle}</strong>.</p>
            <p className="text-muted-foreground dark:text-slate-400 text-sm mt-1 mb-6">
                Please ensure the Blueprint ID, Run Label, and Timestamp are correct and the CLI process completed successfully, generating a <code className="text-xs bg-muted dark:bg-slate-700 p-0.5 rounded">_comparison.json</code> file in the <code className="text-xs bg-muted dark:bg-slate-700 p-0.5 rounded">.results/multi/[BlueprintID]/</code> directory.
            </p>
            <Button onClick={() => router.push('/')} variant="default" className="w-full sm:w-auto px-6 py-2.5">
                Go to Homepage
            </Button>
        </div>
      </div>
    );
  }

  if (promptNotFound) {
    return (
      <div className="container mx-auto p-4 md:p-8">
        <h1 className="text-2xl md:text-3xl font-bold mb-6 text-foreground">Comparison: <span className="text-primary">{pageTitle}</span></h1>
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Prompt Not Found</AlertTitle>
          <AlertDescription>
            The prompt ID specified in the URL ('{currentPromptId}') was not found in this comparison dataset.
          </AlertDescription>
        </Alert>
        <Link href={`/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}`} passHref>
          <Button variant="outline">View All Prompts</Button>
        </Link>
      </div>
    );
  }

  const renderPromptSelector = () => {
    const perPromptData = data?.evaluationResults?.perPromptSimilarities;
    if (!data || !perPromptData) return null;

    const promptIds = Object.keys(perPromptData ?? {});

    const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        const basePath = `/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}`;
        if (value === "__ALL__") {
            router.push(basePath);
        } else {
            router.push(`${basePath}?prompt=${encodeURIComponent(value)}`);
        }
    };

    const currentValue = currentPromptId || "__ALL__";

    return (
      <Card className="mb-6 bg-card/80 dark:bg-slate-800/50 backdrop-blur-md text-card-foreground dark:text-slate-100 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 overflow-hidden">
        <CardHeader className="border-b border-border dark:border-slate-700 py-4 px-6">
            <div className="flex items-center">
                {SlidersHorizontal && <SlidersHorizontal className="w-5 h-5 mr-3 text-primary dark:text-sky-400" />}
                <CardTitle className="text-primary dark:text-sky-400 text-xl">Filter Analysis by Prompt</CardTitle>
            </div>
            <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">Select a specific prompt to drill down into its detailed results, or view the overall analysis for all prompts.</CardDescription>
        </CardHeader>
        <CardContent className="pt-4 pb-6 px-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                <label htmlFor="prompt-select" className="font-medium text-card-foreground dark:text-slate-200 whitespace-nowrap">Filter by prompt:</label>
                <select
                    id="prompt-select"
                    value={currentValue}
                    onChange={handleSelectChange}
                    className="block w-full sm:flex-grow rounded-md border-input bg-input text-foreground dark:border-slate-600 dark:bg-slate-700 dark:text-slate-50 shadow-sm focus:border-primary focus:ring focus:ring-primary focus:ring-opacity-50 text-sm p-2.5"
                >
                    <option value="__ALL__" className="bg-background text-foreground dark:bg-slate-700 dark:text-slate-50">All Prompts (Overall Analysis)</option>
                    {promptIds.map(promptId => (
                        <option key={promptId} value={promptId} title={getPromptText(promptId)} className="bg-background text-foreground dark:bg-slate-700 dark:text-slate-50">
                            {promptId} - {getPromptText(promptId)}
                        </option>
                    ))}
                </select>
            </div>
        </CardContent>
      </Card>
    );
  };

  const handleCellClick = (modelA: string, modelB: string, similarity: number) => {
      if (!currentPromptId || !data?.allResponses || !data?.promptTexts) {
          return;
      }
      
      let coverageScoreA = null;
      let coverageScoreB = null;
      let assessmentsA = null;
      let assessmentsB = null;
      const keyPoints = data.extractedKeyPoints?.[currentPromptId] || null;
      const coverageScoresForPrompt = data.evaluationResults?.llmCoverageScores?.[currentPromptId];

      if (coverageScoresForPrompt) {
          coverageScoreA = coverageScoresForPrompt[modelA] ?? null;
          if (coverageScoreA && !('error' in coverageScoreA)) {
              assessmentsA = coverageScoreA.pointAssessments ?? null;
          }
          coverageScoreB = coverageScoresForPrompt[modelB] ?? null;
          if (coverageScoreB && !('error' in coverageScoreB)) {
              assessmentsB = coverageScoreB.pointAssessments ?? null;
          }
      }
      
      setSelectedPairForModal({
        modelA,
        modelB,
        promptId: currentPromptId,
        promptText: data.promptTexts[currentPromptId] || currentPromptId,
        systemPromptA: modelSystemPrompts[modelA],
        systemPromptB: modelSystemPrompts[modelB],
        responseA: data.allResponses[currentPromptId]?.[modelA] || '',
        responseB: data.allResponses[currentPromptId]?.[modelB] || '',
        semanticSimilarity: similarity,
        performanceSimilarity: null,
        llmCoverageScoreA: coverageScoreA,
        llmCoverageScoreB: coverageScoreB,
        extractedKeyPoints: keyPoints,
        pointAssessmentsA: assessmentsA,
        pointAssessmentsB: assessmentsB
      }); 
      setIsModalOpen(true);
  };

  const handleCloseModal = () => {
      setIsModalOpen(false);
      setSelectedPairForModal(null);
  };

  const handleCoverageCellClick = (clickedModelId: string, assessment: PointAssessment | null /* Assessment arg is no longer directly used for all points */) => {
    if (!data || !currentPromptId) return;

    const promptText = data.promptTexts?.[currentPromptId] || 'Prompt text not found.';
    const modelResponse = data.allResponses?.[currentPromptId]?.[clickedModelId] || 'Response not available.';
    const systemPrompt = modelSystemPrompts[clickedModelId] || null;
    
    const modelCoverageResult = data.evaluationResults?.llmCoverageScores?.[currentPromptId]?.[clickedModelId];
    
    let assessmentsForModal: PointAssessment[] = [];
    if (modelCoverageResult && !('error' in modelCoverageResult) && modelCoverageResult.pointAssessments) {
      assessmentsForModal = modelCoverageResult.pointAssessments;
    } else if (assessment) {
      console.warn(`Could not retrieve all point assessments for ${clickedModelId} on prompt ${currentPromptId}. Displaying modal with potentially incomplete data if any single assessment was passed.`);
    }
    
    // Ensure assessmentsForModal is always an array, even if empty
    if (!Array.isArray(assessmentsForModal)) {
        assessmentsForModal = [];
    }

    setModelEvaluationDetailModalData({
      modelId: clickedModelId,
      assessments: assessmentsForModal,
      promptText,
      modelResponse,
      systemPrompt,
    });
    setIsModelEvaluationDetailModalOpen(true);
  };

  const handleMacroCellClick = (promptId: string, modelId: string, assessment: PointAssessment) => {

    if (!data) return;

    const promptText = data.promptTexts?.[promptId] || 'Prompt text not found.';
    const modelResponse = data.allResponses?.[promptId]?.[modelId] || 'Response not available.';
    const systemPrompt = modelSystemPrompts[modelId] || null;
    const modelCoverageResult = data.evaluationResults?.llmCoverageScores?.[promptId]?.[modelId];
    let assessmentsForModal: PointAssessment[] = [];

    if (modelCoverageResult && !('error' in modelCoverageResult) && modelCoverageResult.pointAssessments) {
      assessmentsForModal = modelCoverageResult.pointAssessments;
    } else {
      console.warn(`Could not retrieve all point assessments for ${modelId} on prompt ${promptId} from macro table click. Displaying modal with potentially incomplete data.`);
    }
     if (!Array.isArray(assessmentsForModal)) {
        assessmentsForModal = [];
    }


    setModelEvaluationDetailModalData({
      modelId: modelId,
      assessments: assessmentsForModal,
      promptText,
      modelResponse,
      systemPrompt,
    });
    setIsModelEvaluationDetailModalOpen(true);
  };

  const handleCloseModelEvaluationDetailModal = () => { // Renamed
    setIsModelEvaluationDetailModalOpen(false);
    setModelEvaluationDetailModalData(null);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 -z-10 dark:bg-gradient-to-br dark:from-slate-900 dark:to-slate-800 bg-gradient-to-br from-slate-50 to-slate-100" />
      <div className="max-w-[1800px] mx-auto px-2 sm:px-4 lg:px-6 py-4 md:py-6 space-y-6 md:space-y-8">
        <AnalysisPageHeader
          breadcrumbs={breadcrumbItems}
          pageTitle={pageTitle}
          contextualInfo={{
            configTitle: data?.configTitle,
            runLabel: data?.runLabel,
            timestamp: data?.timestamp, 
            displayTimestamp: data?.timestamp ? formatTimestampForDisplay(data.timestamp) : undefined,
            description: data?.config?.description,
            tags: data?.config?.tags
          }}
          actions={headerActions}
          isSticky={false}
        />
        
        <main className="w-full space-y-6 sm:px-2 lg:px-0">
          {excludedModelsList.length > 0 && (
            <Alert variant="default" className="mb-6 bg-highlight-warning/30 border-highlight-warning text-highlight-warning dark:bg-amber-800/30 dark:border-amber-700 dark:text-amber-200 ring-1 ring-highlight-warning/50 dark:ring-amber-600/50 shadow-lg">
                {AlertCircle && <AlertCircle className="h-5 w-5 text-highlight-warning dark:text-amber-400" />}
                <AlertTitle className="text-highlight-warning dark:text-amber-300 font-semibold">Models Excluded</AlertTitle>
                <AlertDescription className="text-highlight-warning/90 dark:text-amber-300/90 text-sm">
                    The following models were excluded from parts of this comparison due to errors or empty responses during generation:
                    <ul className="list-disc list-inside mt-1.5 text-xs pl-2 space-y-0.5">
                        {excludedModelsList.map(modelId => <li key={modelId}>{getModelDisplayLabel(modelId)}</li>)}
                    </ul>
                    Check the debug panel for raw error details if needed.
                </AlertDescription>
            </Alert>
          )}
          
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-1">
            {!currentPromptId && (
              <>
                <DatasetStatistics 
                  promptStats={data?.promptStatistics}
                  overallSimilarityMatrix={data?.evaluationResults?.similarityMatrix}
                  overallIdealExtremes={overallIdealExtremes ?? undefined}
                  overallCoverageExtremes={overallCoverageExtremes ?? undefined}
                  overallAvgCoverageStats={overallAvgCoverageStats ?? undefined}
                  modelsStrings={data?.effectiveModels}
                  overallHybridExtremes={overallHybridExtremes ?? undefined}
                  overallAverageHybridScore={overallAverageHybridScore}
                  overallHybridScoreStdDev={overallHybridScoreStdDev}
                  allLlmCoverageScores={data?.evaluationResults?.llmCoverageScores}
                  promptTexts={data?.promptTexts}
                  allPromptIds={data?.promptIds}
                />
                {calculatedPerModelHybridScores.size > 0 && displayedModels.length > 0 && (
                  <PerModelHybridScoresCard 
                    perModelHybridScores={calculatedPerModelHybridScores} 
                    perModelSemanticSimilarityScores={calculatedPerModelSemanticScores}
                    modelIds={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                  />
                )}
              </>
            )}
          </div>
          
          {currentPromptId && (
            <div className="mb-4">
              <div className="flex items-center text-sm mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  className="bg-background/50 dark:bg-slate-900/50 text-foreground dark:text-slate-200 border-border dark:border-slate-700 hover:bg-accent hover:text-accent-foreground dark:hover:bg-slate-800"
                >
                  <Link href={`/analysis/${configIdFromUrl}/${runLabel}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 mr-1.5">
                      <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
                    </svg>
                    Back to All Instances of this Run Label
                  </Link>
                </Button>
                <span className="mx-2 text-muted-foreground dark:text-slate-500">/</span>
                <span className="text-foreground dark:text-slate-200 font-medium">
                  Prompt {currentPromptId} (for run at {timestampFromUrl ? new Date(fromSafeTimestamp(timestampFromUrl)).toLocaleTimeString() : 'N/A'})
                </span>
              </div>
            </div>
          )}

          {!currentPromptId && renderPromptSelector()}

          {currentPromptId && (
            <div className="space-y-6">
              <div className="bg-background/50 dark:bg-slate-900/50 backdrop-blur-sm p-8 rounded-2xl shadow-lg text-foreground dark:text-slate-100 border border-border/50 dark:border-slate-700/50">
                <h2 className="text-sm uppercase tracking-wider text-muted-foreground dark:text-slate-400 mb-4 font-medium">Current Prompt</h2>
                <div className="text-xl md:text-2xl font-medium leading-relaxed whitespace-pre-wrap">
                  {data?.promptTexts?.[currentPromptId] || currentPromptId}
                </div>
              </div>

              {currentPromptId && data?.evaluationResults?.llmCoverageScores?.[currentPromptId] && data?.effectiveModels && data?.allResponses?.[currentPromptId]?.[IDEAL_MODEL_ID] && (
                <KeyPointCoverageComparisonDisplay
                  coverageScores={data.evaluationResults.llmCoverageScores[currentPromptId]}
                  models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)} 
                  promptResponses={data.allResponses[currentPromptId]}
                  idealModelId={IDEAL_MODEL_ID}
                  promptId={currentPromptId}
                  onModelClick={(modelId: string) => {
                    if (!data?.allResponses?.[currentPromptId] || !data?.promptTexts?.[currentPromptId] || !data?.evaluationResults?.perPromptSimilarities?.[currentPromptId]) return;

                    const coverageScoresForPrompt = data.evaluationResults.llmCoverageScores?.[currentPromptId];
                    const keyPoints = data.extractedKeyPoints?.[currentPromptId] || null;
                    const coverageScore = coverageScoresForPrompt?.[modelId] ?? null;
                    let assessments = null;
                    if (coverageScore && !('error' in coverageScore)) {
                      assessments = coverageScore.pointAssessments ?? null;
                    }

                    const perPromptSims = data.evaluationResults?.perPromptSimilarities[currentPromptId];
                    const semanticSim = perPromptSims[modelId]?.[IDEAL_MODEL_ID] ?? perPromptSims[IDEAL_MODEL_ID]?.[modelId] ?? null;

                    setSelectedPairForModal({
                      modelA: modelId,
                      modelB: IDEAL_MODEL_ID,
                      promptId: currentPromptId,
                      promptText: data.promptTexts[currentPromptId],
                      systemPromptA: modelSystemPrompts[modelId],
                      systemPromptB: modelSystemPrompts[IDEAL_MODEL_ID],
                      responseA: data.allResponses[currentPromptId][modelId] || '',
                      responseB: data.allResponses[currentPromptId][IDEAL_MODEL_ID] || '',
                      semanticSimilarity: semanticSim,
                      performanceSimilarity: null,
                      llmCoverageScoreA: coverageScore,
                      llmCoverageScoreB: null,
                      extractedKeyPoints: keyPoints,
                      pointAssessmentsA: assessments,
                      pointAssessmentsB: null
                    });
                    setIsModalOpen(true);
                  }}
                />
              )}

              {currentPromptId && data?.evaluationResults?.perPromptSimilarities?.[currentPromptId] && data?.effectiveModels && data?.allResponses?.[currentPromptId] && data?.promptTexts?.[currentPromptId] && (
                <SemanticExtremesDisplay
                  promptSimilarities={data.evaluationResults.perPromptSimilarities[currentPromptId]}
                  models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                  promptResponses={data.allResponses[currentPromptId]}
                  idealModelId={IDEAL_MODEL_ID}
                  promptId={currentPromptId}
                  onModelClick={(modelId: string) => {
                    if (!data?.allResponses?.[currentPromptId] || !data?.promptTexts?.[currentPromptId]) return;

                    const coverageScoresForPrompt = data.evaluationResults.llmCoverageScores?.[currentPromptId];
                    const keyPoints = data.extractedKeyPoints?.[currentPromptId] || null;
                    const coverageScore = coverageScoresForPrompt?.[modelId] ?? null;
                    let assessments = null;
                    if (coverageScore && !('error' in coverageScore)) {
                      assessments = coverageScore.pointAssessments ?? null;
                    }

                    const perPromptSims = data.evaluationResults?.perPromptSimilarities?.[currentPromptId];
                    const semanticSim = perPromptSims?.[modelId]?.[IDEAL_MODEL_ID] ?? perPromptSims?.[IDEAL_MODEL_ID]?.[modelId] ?? null;

                    setSelectedPairForModal({
                      modelA: modelId,
                      modelB: IDEAL_MODEL_ID,
                      promptId: currentPromptId,
                      promptText: data.promptTexts[currentPromptId],
                      systemPromptA: modelSystemPrompts[modelId],
                      systemPromptB: modelSystemPrompts[IDEAL_MODEL_ID],
                      responseA: data.allResponses[currentPromptId][modelId] || '',
                      responseB: data.allResponses[currentPromptId][IDEAL_MODEL_ID] || '',
                      semanticSimilarity: semanticSim,
                      performanceSimilarity: null,
                      llmCoverageScoreA: coverageScore,
                      llmCoverageScoreB: null,
                      extractedKeyPoints: keyPoints,
                      pointAssessmentsA: assessments,
                      pointAssessmentsB: null
                    });
                    setIsModalOpen(true);
                  }}
                />
              )}

              {currentPromptId && (() => {
                const coverageScoresForCurrentPrompt = data?.evaluationResults?.llmCoverageScores?.[currentPromptId];
                let hasAssessmentsToShow = false;
                if (coverageScoresForCurrentPrompt && typeof coverageScoresForCurrentPrompt === 'object') {
                  for (const modelId in coverageScoresForCurrentPrompt) {
                    const modelCoverage = coverageScoresForCurrentPrompt[modelId];
                    if (modelCoverage && !('error' in modelCoverage) && modelCoverage.pointAssessments && modelCoverage.pointAssessments.length > 0) {
                      hasAssessmentsToShow = true;
                      break;
                    }
                  }
                }

                if (hasAssessmentsToShow) {
                  return (
                    <Card className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md text-card-foreground dark:text-slate-100 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 overflow-hidden">
                        <CardHeader className="border-b border-border dark:border-slate-700 py-4 px-6">
                              <div className="flex items-center">
                                {Eye && <Eye className="w-5 h-5 mr-3 text-primary dark:text-sky-400" />}
                                <CardTitle className="text-primary dark:text-sky-400 text-xl">Detailed Key Point Coverage</CardTitle>
                            </div>
                            <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                                For prompt: <strong className="text-card-foreground dark:text-slate-200 font-normal">{getPromptText(currentPromptId)}</strong>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-6 px-6 pb-6">
                            <KeyPointCoverageTable 
                                coverageScores={coverageScoresForCurrentPrompt}
                                models={modelsToDisplayInGraphs.filter(m => m !== IDEAL_MODEL_ID)}
                                onCellClick={handleCoverageCellClick}
                            />
                        </CardContent>
                    </Card>
                  );
                }
                return null;
              })() }

              {data?.effectiveModels && safeMatrixForCurrentView && (
                <div className="space-y-6">
                  <Card className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md text-card-foreground dark:text-slate-100 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 overflow-hidden">
                    <CardHeader className="border-b border-border dark:border-slate-700 py-4 px-6">
                      <div className="flex items-center">
                          {BarChartBig && <BarChartBig className="w-5 h-5 mr-3 text-primary dark:text-sky-400" />}
                          <CardTitle className="text-primary dark:text-sky-400 text-xl">
                              Semantic Similarity Heatmap (Prompt-Specific)
                          </CardTitle>
                      </div>
                      <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                          Pairwise semantic similarity for prompt: <strong className='text-card-foreground dark:text-slate-200 font-normal'>{getPromptText(currentPromptId)}</strong>. Darker means more similar.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 px-6 pb-6 min-h-[350px]">
                      <SimilarityHeatmap
                        similarityMatrix={safeMatrixForCurrentView}
                        models={modelsToDisplayInGraphs}
                        onCellClick={handleCellClick}
                      />
                    </CardContent>
                  </Card>
                  <Card className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md text-card-foreground dark:text-slate-100 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 overflow-hidden">
                    <CardHeader className="border-b border-border dark:border-slate-700 py-4 px-6">
                      <div className="flex items-center">
                          {BarChartBig && <BarChartBig className="w-5 h-5 mr-3 text-primary dark:text-sky-400" />}
                          <CardTitle className="text-primary dark:text-sky-400 text-xl">
                              Semantic Model Relationship Graph (Prompt-Specific)
                          </CardTitle>
                      </div>
                      <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                          Force-directed graph based on semantic similarity for prompt: <strong className='text-card-foreground dark:text-slate-200 font-normal'>{getPromptText(currentPromptId)}</strong>. Closer nodes are more similar.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 px-6 pb-6 min-h-[500px]">
                       <SimilarityGraph
                         similarityMatrix={safeMatrixForCurrentView} 
                         models={modelsToDisplayInGraphs} 
                         resolvedTheme={resolvedTheme}
                       />
                    </CardContent>
                  </Card>
                  {modelsToDisplayInGraphs.length >= 2 && (
                      <Card className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md text-card-foreground dark:text-slate-100 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 overflow-hidden">
                      <CardHeader className="border-b border-border dark:border-slate-700 py-4 px-6">
                          <div className="flex items-center">
                          {BarChartBig && <BarChartBig className="w-5 h-5 mr-3 text-primary dark:text-sky-400" />}                       
                          <CardTitle className="text-primary dark:text-sky-400 text-xl">
                              Hierarchical Clustering (Prompt-Specific)
                          </CardTitle>
                          </div>
                          <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                              Models clustered by semantic similarity for prompt: <strong className='text-card-foreground dark:text-slate-200 font-normal'>{getPromptText(currentPromptId)}</strong>. Shorter branches mean more similar.
                          </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-6 px-6 pb-6 min-h-[350px]">
                          <DendrogramChart
                          similarityMatrix={safeMatrixForCurrentView}
                          models={modelsToDisplayInGraphs} 
                          />
                      </CardContent>
                      </Card>
                  )}
                </div>
              )}

            </div>
          )}
          
          {data?.evaluationResults?.llmCoverageScores && !currentPromptId && (
               <Card className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md text-card-foreground dark:text-slate-100 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 overflow-hidden mt-6 mb-6">
                  <CardHeader className="border-b border-border dark:border-slate-700 py-4 px-6">
                      <div className="flex items-center">
                          {BarChartBig && <BarChartBig className="w-5 h-5 mr-3 text-primary dark:text-sky-400" />}
                          <CardTitle className="text-primary dark:text-sky-400 text-xl">Overall Key Point Coverage</CardTitle>
                      </div>
                      <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">Average key point coverage per model across all evaluated prompts.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 px-6 pb-6">
                      <MacroCoverageTable 
                          allCoverageScores={data.evaluationResults.llmCoverageScores}
                          promptIds={data.promptIds || []} 
                          promptTexts={data.promptTexts || {}}
                          models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                          configId={configIdFromUrl}
                          runLabel={runLabel}
                          safeTimestampFromParams={timestampFromUrl}
                          onCellClick={handleMacroCellClick}
                      />
                  </CardContent>
              </Card>
          )}

          {!currentPromptId && data?.effectiveModels && safeMatrixForCurrentView && (
            <div className="space-y-6 mb-6">
              <Card className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md text-card-foreground dark:text-slate-100 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 overflow-hidden">
                <CardHeader className="border-b border-border dark:border-slate-700 py-4 px-6">
                  <div className="flex items-center">
                      {BarChartBig && <BarChartBig className="w-5 h-5 mr-3 text-primary dark:text-sky-400" />}
                      <CardTitle className="text-primary dark:text-sky-400 text-xl">
                          Semantic Similarity Heatmap (Overall Average)
                      </CardTitle>
                  </div>
                  <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                    Overall average pairwise semantic similarity across all prompts. Darker means more similar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 px-6 pb-6 min-h-[350px]">
                  <SimilarityHeatmap
                    similarityMatrix={safeMatrixForCurrentView} 
                    models={modelsToDisplayInGraphs}
                    onCellClick={handleCellClick} 
                  />
                </CardContent>
              </Card>
              <Card className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md text-card-foreground dark:text-slate-100 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 overflow-hidden">
                <CardHeader className="border-b border-border dark:border-slate-700 py-4 px-6">
                  <div className="flex items-center">
                      {BarChartBig && <BarChartBig className="w-5 h-5 mr-3 text-primary dark:text-sky-400" />}
                      <CardTitle className="text-primary dark:text-sky-400 text-xl">
                          Semantic Model Relationship Graph (Overall Average)
                      </CardTitle>
                  </div>
                  <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                      Force-directed graph based on overall average semantic similarity. Closer nodes are more similar.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6 px-6 pb-6 min-h-[500px]">
                   <SimilarityGraph
                     similarityMatrix={safeMatrixForCurrentView} 
                     models={modelsToDisplayInGraphs} 
                     resolvedTheme={resolvedTheme}
                   />
                </CardContent>
              </Card>
              {modelsToDisplayInGraphs.length >= 2 && (
                  <Card className="bg-card/80 dark:bg-slate-800/50 backdrop-blur-md text-card-foreground dark:text-slate-100 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700 overflow-hidden">
                  <CardHeader className="border-b border-border dark:border-slate-700 py-4 px-6">
                      <div className="flex items-center">
                      {BarChartBig && <BarChartBig className="w-5 h-5 mr-3 text-primary dark:text-sky-400" />}                       
                      <CardTitle className="text-primary dark:text-sky-400 text-xl">
                          Hierarchical Clustering (Overall Average)
                      </CardTitle>
                      </div>
                      <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                        A dendogram showing models clustered hierarchically using Ward linkage, which groups models based on overall response similarity to minimize variance at each merge. Lower horizontal branches indicate higher similarity between the merged groups/models.
                      </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6 px-6 pb-6 min-h-[350px]">
                      <DendrogramChart
                      similarityMatrix={safeMatrixForCurrentView}
                      models={modelsToDisplayInGraphs} 
                      />
                  </CardContent>
                  </Card>
              )}
            </div>
          )}
          
          <DebugPanel data={data} configId={configIdFromUrl} runLabel={runLabel} timestamp={timestampFromUrl} />
          
          {selectedPairForModal && (
            <ResponseComparisonModal
              isOpen={isModalOpen}
              onClose={handleCloseModal}
              modelA={selectedPairForModal.modelA}
              modelB={selectedPairForModal.modelB}
              promptText={selectedPairForModal.promptText}
              systemPromptA={selectedPairForModal.systemPromptA}
              systemPromptB={selectedPairForModal.systemPromptB}
              responseA={selectedPairForModal.responseA}
              responseB={selectedPairForModal.responseB}
              llmCoverageScoreA={selectedPairForModal.llmCoverageScoreA}
              llmCoverageScoreB={selectedPairForModal.llmCoverageScoreB}
              extractedKeyPoints={selectedPairForModal.extractedKeyPoints}
              pointAssessmentsA={selectedPairForModal.pointAssessmentsA}
              pointAssessmentsB={selectedPairForModal.pointAssessmentsB}
              semanticSimilarity={selectedPairForModal.semanticSimilarity} 
              performanceSimilarity={selectedPairForModal.performanceSimilarity}
            />
          )}
          
          {modelEvaluationDetailModalData && (
            <ModelEvaluationDetailModal
              isOpen={isModelEvaluationDetailModalOpen}
              onClose={handleCloseModelEvaluationDetailModal}
              data={modelEvaluationDetailModalData}
            />
          )}
          
        </main>
      </div>
    </div>
  );
} 