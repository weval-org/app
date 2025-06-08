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
    SelectedPairInfo as ImportedSelectedPairInfo,
    ConversationMessage,
    PointAssessment as ImportedPointAssessment,
    CoverageResult as ImportedCoverageResult,
    ConfigData
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
import PerModelHybridScoresCard from '@/app/analysis/components/PerModelHybridScoresCard';
import AnalysisPageHeader from '@/app/analysis/components/AnalysisPageHeader';
import type { AnalysisPageHeaderProps } from '@/app/analysis/components/AnalysisPageHeader';
import { fromSafeTimestamp, formatTimestampForDisplay } from '@/app/utils/timestampUtils';
import ModelEvaluationDetailModal from '@/app/analysis/components/ModelEvaluationDetailModal';
import DebugPanel from '@/app/analysis/components/DebugPanel';
import CoverageHeatmapCanvas from '@/app/analysis/components/CoverageHeatmapCanvas';
import { Badge } from '@/components/ui/badge';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';

const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle))
const XCircle = dynamic(() => import("lucide-react").then((mod) => mod.XCircle))
const Loader2 = dynamic(() => import("lucide-react").then((mod) => mod.Loader2))
const HelpCircle = dynamic(() => import("lucide-react").then(mod => mod.HelpCircle))
const CheckCircle2 = dynamic(() => import("lucide-react").then((mod) => mod.CheckCircle2))

interface ModelEvaluationDetailModalData {
  modelId: string;
  assessments: ImportedPointAssessment[]; 
  promptContext: string | ConversationMessage[];
  modelResponse: string;
  systemPrompt: string | null;
}

export default function BetaComparisonClientPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  
  const configIdFromUrl = params.configId as string;
  const runLabel = params.runLabel as string;
  const timestampFromUrl = params.timestamp as string;

  const currentPromptId = searchParams.get('prompt');

  const [data, setData] = useState<ImportedComparisonDataV2 | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [promptNotFound, setPromptNotFound] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedPairForModal, setSelectedPairForModal] = useState<ImportedSelectedPairInfo | null>(null);
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
  
  const [modelEvaluationDetailModalData, setModelEvaluationDetailModalData] = useState<ModelEvaluationDetailModalData | null>(null);
  const [isModelEvaluationDetailModalOpen, setIsModelEvaluationDetailModalOpen] = useState<boolean>(false);

  // State for dynamically imported markdown components
  const [ReactMarkdown, setReactMarkdown] = useState<any>(null);
  const [RemarkGfm, setRemarkGfm] = useState<any>(null);

  const { resolvedTheme } = useTheme();

  const headerWidgetContent = useMemo(() => {
    if (currentPromptId || !data?.evaluationResults?.llmCoverageScores || !data.promptIds || displayedModels.filter(m => m !== IDEAL_MODEL_ID).length === 0) {
      return null;
    }
    return (
      <CoverageHeatmapCanvas
        allCoverageScores={data.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>} 
        promptIds={data.promptIds}
        models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
        width={100}
        height={50}
        className="rounded-md border border-border dark:border-slate-700 shadow-sm"
      />
    );
  }, [currentPromptId, data, displayedModels]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setPromptNotFound(false);
        const response = await fetch(`/api/comparison/${configIdFromUrl}/${runLabel}/${timestampFromUrl}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch comparison data: ${response.statusText} for ${configIdFromUrl}/${runLabel}/${timestampFromUrl}`);
        }
        
        const result: ImportedComparisonDataV2 = await response.json();
        setData(result);
        
        const excludedFromData = result.excludedModels || [];
        const modelsWithEmptyResponses = new Set<string>(excludedFromData);

        if (result.allFinalAssistantResponses && result.effectiveModels) {
          result.effectiveModels.forEach((modelId: string) => {
            if (modelsWithEmptyResponses.has(modelId)) return;
            if (result.allFinalAssistantResponses) {
              for (const promptId in result.allFinalAssistantResponses) {
                const responseText = result.allFinalAssistantResponses[promptId]?.[modelId];
                if (responseText === undefined || responseText.trim() === '') {
                  modelsWithEmptyResponses.add(modelId);
                  break;
                }
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
            const coverageExtremes = importedCalculateOverallCoverageExtremes(result.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>, result.effectiveModels);
            setOverallCoverageExtremes(coverageExtremes);
            
            if (result.promptIds) {
                const avgCoverageStats = importedCalculateOverallAverageCoverage(
                    result.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>, 
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
              result.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>,
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
              result.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>,
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

        if (result.evaluationResults?.perModelHybridScores) {
          let scoresToSet = result.evaluationResults.perModelHybridScores;
          if (typeof scoresToSet === 'object' && !(scoresToSet instanceof Map)) {
            scoresToSet = new Map(Object.entries(scoresToSet));
          }
          setCalculatedPerModelHybridScores(scoresToSet as Map<string, { average: number | null; stddev: number | null }>);
        } else {
          setCalculatedPerModelHybridScores(new Map());
        }
        
        if (result.evaluationResults?.perModelSemanticScores) {
          let scoresToSet = result.evaluationResults.perModelSemanticScores;
          if (typeof scoresToSet === 'object' && !(scoresToSet instanceof Map)) {
            scoresToSet = new Map(Object.entries(scoresToSet));
          }
          setCalculatedPerModelSemanticScores(scoresToSet as Map<string, { average: number | null; stddev: number | null }>);
        } else {
          console.warn("API did not provide perModelSemanticScores. Ensure API calculates this.");
          setCalculatedPerModelSemanticScores(new Map());
        }

      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        console.error(`Error fetching comparison data for ${configIdFromUrl}/${runLabel}/${timestampFromUrl}:`, err);
      } finally {
        setLoading(false);
      }
    };
    if (configIdFromUrl && runLabel && timestampFromUrl) {
      fetchData();
    }
  }, [configIdFromUrl, runLabel, timestampFromUrl, currentPromptId]);

  useEffect(() => {
    import('react-markdown').then(mod => setReactMarkdown(() => mod.default));
    import('remark-gfm').then(mod => setRemarkGfm(() => mod.default));
  }, []);

  const getPromptContextDisplayString = useMemo(() => (promptId: string): string => {
    if (!data || !data.promptContexts) return promptId;
    const context = data.promptContexts[promptId];
    if (typeof context === 'string') {
      return context;
    }
    if (Array.isArray(context) && context.length > 0) {
      const lastUserMessage = [...context].reverse().find(msg => msg.role === 'user');
      if (lastUserMessage) {
        return `User: ${lastUserMessage.content.substring(0, 100)}${lastUserMessage.content.length > 100 ? '...' : ''}`;
      }
      return `Multi-turn context (${context.length} messages)`;
    }
    return promptId;
  }, [data]);

  const currentPromptDisplayText = useMemo(() => currentPromptId ? getPromptContextDisplayString(currentPromptId) : 'All Prompts', [currentPromptId, getPromptContextDisplayString]);
  
  const pageTitle = useMemo(() => {
    let title = "Analysis";
    if (data) {
      title = `${data.configTitle || configIdFromUrl} - ${data.runLabel || runLabel}`;
      if (timestampFromUrl) {
        title += ` (${formatTimestampForDisplay(fromSafeTimestamp(timestampFromUrl))})`;
      }
    } else if (configIdFromUrl && runLabel && timestampFromUrl) {
      title = `${configIdFromUrl} - ${runLabel}`;
      title += ` (${formatTimestampForDisplay(fromSafeTimestamp(timestampFromUrl))})`;
    }
    if (currentPromptId) {
      title += ` - Prompt: ${currentPromptDisplayText}`;
    }
    return title;
  }, [data, configIdFromUrl, runLabel, timestampFromUrl, currentPromptId, currentPromptDisplayText]);

  const breadcrumbItems = useMemo(() => {
    const items: AnalysisPageHeaderProps['breadcrumbs'] = [
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
        label: timestampFromUrl ? formatTimestampForDisplay(fromSafeTimestamp(timestampFromUrl)) : "Instance",
        ...(currentPromptId ? { href: `/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}` } : {})
      }
    ];
    if (currentPromptId) {
      items.push({ label: `Prompt: ${currentPromptDisplayText}` });
    }
    return items;
  }, [data, configIdFromUrl, runLabel, timestampFromUrl, currentPromptId, currentPromptDisplayText]);

  const isLoadingFirstTime = loading && !data;

  const safeMatrixForCurrentView = useMemo(() => {
    if (!data?.evaluationResults?.similarityMatrix) return null;
    if (!currentPromptId) return data.evaluationResults.similarityMatrix;
    return data.evaluationResults?.perPromptSimilarities?.[currentPromptId] || null;
  }, [currentPromptId, data]);

  const handleCloseModelEvaluationDetailModal = () => {
    setIsModelEvaluationDetailModalOpen(false);
    setModelEvaluationDetailModalData(null);
  };
  
  const handleModelHeaderClickInKPCoverageTable = (clickedModelId: string) => {
    if (!data || !currentPromptId || !data.promptContexts || !data.allFinalAssistantResponses) return;

    const currentModelResponse = data.allFinalAssistantResponses[currentPromptId]?.[clickedModelId];
    const promptContextForModal = data.promptContexts[currentPromptId];
    
    const modelCoverageResult = data.evaluationResults?.llmCoverageScores?.[currentPromptId]?.[clickedModelId] as ImportedCoverageResult | undefined;
    const relevantAssessments = (modelCoverageResult && !('error' in modelCoverageResult)) ? (modelCoverageResult.pointAssessments || []) : [];

    if (!currentModelResponse) {
      console.warn("Could not open detail modal from KPCoverageTable header: Model response not found for", currentPromptId, clickedModelId);
      // Optionally, set an error state or show a toast notification
      return;
    }

    setModelEvaluationDetailModalData({
      modelId: clickedModelId,
      assessments: relevantAssessments, // Pass all assessments for this model-prompt pair
      promptContext: promptContextForModal,
      modelResponse: currentModelResponse,
      systemPrompt: data.modelSystemPrompts?.[clickedModelId] || null
    });
    setIsModelEvaluationDetailModalOpen(true);
  };

  const renderPromptDetails = () => {
    if (!currentPromptId || !data || !data.promptContexts) {
      return null;
    }
    const context = data.promptContexts[currentPromptId];

    if (typeof context === 'string') {
      return <div className="text-card-foreground dark:text-slate-300 whitespace-pre-wrap">{context}</div>;
    }

    if (Array.isArray(context)) {
      if (context.length === 1 && context[0].role === 'user') {
        return <div className="text-card-foreground dark:text-slate-300 whitespace-pre-wrap">{context[0].content}</div>;
      }
      if (context.length > 0) {
        return (
          <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar p-1 rounded bg-muted/30 dark:bg-slate-700/20">
            {context.map((msg, index) => (
              <div key={index} className={`p-2 rounded-md ${msg.role === 'user' ? 'bg-sky-100 dark:bg-sky-900/50' : 'bg-slate-100 dark:bg-slate-800/50'}`}>
                <p className="text-xs font-semibold text-muted-foreground dark:text-slate-400 capitalize">{msg.role}</p>
                <p className="text-sm text-card-foreground dark:text-slate-200 whitespace-pre-wrap">{msg.content}</p>
              </div>
            ))}
          </div>
        );
      }
    }
    return <div className="text-card-foreground dark:text-slate-300 whitespace-pre-wrap">{currentPromptDisplayText}</div>;
  };

  const renderPromptSelector = () => {
    if (!data || !data.promptIds) return null;

    const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedPromptId = event.target.value;
      if (selectedPromptId === '__ALL__') {
        router.push(`/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}`);
      } else {
        router.push(`/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}?prompt=${selectedPromptId}`);
      }
    };

    return (
      <div className="mb-6">
        <label htmlFor="prompt-selector" className="block text-sm font-medium text-muted-foreground dark:text-slate-400 mb-1">Select Prompt:</label>
        <select
          id="prompt-selector"
          value={currentPromptId || '__ALL__'}
          onChange={handleSelectChange}
          className="block w-full p-2 border border-border dark:border-slate-700 rounded-md shadow-sm focus:ring-primary focus:border-primary bg-card dark:bg-slate-800 text-card-foreground dark:text-slate-100 text-sm"
        >
          <option value="__ALL__" className="bg-background text-foreground dark:bg-slate-700 dark:text-slate-50">All Prompts (Overall Analysis)</option>
          {data.promptIds.map(promptId => (
            <option key={promptId} value={promptId} title={getPromptContextDisplayString(promptId)} className="bg-background text-foreground dark:bg-slate-700 dark:text-slate-50">
              {promptId} - {getPromptContextDisplayString(promptId)}
            </option>
          ))}
        </select>
      </div>
    );
  };

  const handleCellClick = (modelA: string, modelB: string, similarity: number) => {
    if (!data || !currentPromptId || !data.allFinalAssistantResponses || !data.promptContexts) return;

    const contextForPrompt = data.promptContexts[currentPromptId];
    const coverageScoresForPrompt = data.evaluationResults?.llmCoverageScores?.[currentPromptId] as Record<string, ImportedCoverageResult> | undefined;
    
    let coverageA: ImportedCoverageResult | null = null;
    let coverageB: ImportedCoverageResult | null = null;

    if (coverageScoresForPrompt) {
        coverageA = coverageScoresForPrompt[modelA] ?? null;
        coverageB = coverageScoresForPrompt[modelB] ?? null;
    }
    
    const pointAssessmentsA = (coverageA && !('error' in coverageA)) ? coverageA.pointAssessments : null;
    const pointAssessmentsB = (coverageB && !('error' in coverageB)) ? coverageB.pointAssessments : null;

    setSelectedPairForModal({
      modelA,
      modelB,
      promptId: currentPromptId,
      promptContext: contextForPrompt,
      responseA: data.allFinalAssistantResponses[currentPromptId]?.[modelA] || 'Response not found',
      responseB: data.allFinalAssistantResponses[currentPromptId]?.[modelB] || 'Response not found',
      systemPromptA: data.modelSystemPrompts?.[modelA] || null,
      systemPromptB: data.modelSystemPrompts?.[modelB] || null,
      semanticSimilarity: similarity,
      llmCoverageScoreA: coverageA,
      llmCoverageScoreB: coverageB,
      extractedKeyPoints: data.extractedKeyPoints?.[currentPromptId] || null,
      pointAssessmentsA: pointAssessmentsA || undefined, 
      pointAssessmentsB: pointAssessmentsB || undefined, 
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPairForModal(null);
  };

  const handleCoverageCellClick = (clickedModelId: string, assessment: ImportedPointAssessment | null) => {
    if (!data || !currentPromptId || !data.promptContexts || !data.allFinalAssistantResponses || !assessment) {
        return;
    }

    const llmCoverageScoresTyped = data.evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;
    const modelResult = llmCoverageScoresTyped?.[currentPromptId]?.[clickedModelId];

    if (!modelResult || 'error' in modelResult || !modelResult.pointAssessments) {
        console.warn(`No valid assessments found for ${clickedModelId} on prompt ${currentPromptId}`);
        return;
    }
    
    const modalData: ModelEvaluationDetailModalData = {
        modelId: clickedModelId,
        assessments: modelResult.pointAssessments,
        promptContext: data.promptContexts[currentPromptId],
        modelResponse: data.allFinalAssistantResponses[currentPromptId]?.[clickedModelId] || '',
        systemPrompt: data.modelSystemPrompts?.[clickedModelId] || data.config.systemPrompt || null,
    };

    setModelEvaluationDetailModalData(modalData);
    setIsModelEvaluationDetailModalOpen(true);
  };
  
  const handleMacroCellClick = (promptId: string, modelId: string) => {
    if (!data || !data.evaluationResults?.llmCoverageScores) {
        console.error("Cannot open model evaluation modal: core evaluation data is missing.");
        return;
    }

    const llmCoverageScoresTyped = data.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>;
    const modelResult = llmCoverageScoresTyped[promptId]?.[modelId];

    if (!modelResult || 'error' in modelResult || !modelResult.pointAssessments) {
        console.warn(`No valid assessments found for ${modelId} on prompt ${promptId}`);
        return;
    }

    const promptContext = data.promptContexts?.[promptId] 
        || data.config?.prompts?.find(p => p.id === promptId)?.messages;
    
    const modelResponse = data.allFinalAssistantResponses?.[promptId]?.[modelId];

    if (!promptContext) {
        console.error(`Could not find prompt context for promptId: ${promptId}. Cannot open modal.`);
        return;
    }

    const modalData: ModelEvaluationDetailModalData = {
        modelId: modelId,
        assessments: modelResult.pointAssessments,
        promptContext: promptContext,
        modelResponse: modelResponse ?? "Response text not found in result data. The data file may be missing the 'allFinalAssistantResponses' field.",
        systemPrompt: data.modelSystemPrompts?.[modelId] || data.config.systemPrompt || null,
    };

    setModelEvaluationDetailModalData(modalData);
    setIsModelEvaluationDetailModalOpen(true);
  };

  const handleModelClickForSemanticExtremes = (modelId: string) => {
      // This is a simplified version just to open the modal with the first prompt's data
      // A more sophisticated implementation might find a representative prompt or let user choose
      if (!data || !data.promptIds || data.promptIds.length === 0) return;
      
      const firstPromptId = data.promptIds[0];
      const llmCoverageScoresTyped = data.evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;
      const modelResult = llmCoverageScoresTyped?.[firstPromptId]?.[modelId];
      
      const modalData: ModelEvaluationDetailModalData = {
          modelId: modelId,
          assessments: (modelResult && !('error' in modelResult)) ? modelResult.pointAssessments || [] : [],
          promptContext: data.promptContexts?.[firstPromptId] || `Context for ${firstPromptId} not found.`,
          modelResponse: data.allFinalAssistantResponses?.[firstPromptId]?.[modelId] || 'Response not available.',
          systemPrompt: data.modelSystemPrompts?.[modelId] || data.config.systemPrompt || null,
      };

      setModelEvaluationDetailModalData(modalData);
      setIsModelEvaluationDetailModalOpen(true);
  };

  const promptTextsForMacroTable = useMemo(() => {
    if (!data?.promptContexts) return {};
    return Object.fromEntries(
      Object.entries(data.promptContexts).map(([promptId, context]) => [
        promptId,
        typeof context === 'string' ? context : getPromptContextDisplayString(promptId)
      ])
    );
  }, [data?.promptContexts, getPromptContextDisplayString]);


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-200px)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Loading analysis data...</p>
      </div>
    )
  }

  if (error) {
    return (
        <Alert variant="destructive" className="max-w-2xl mx-auto my-10">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error Loading Data</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
        </Alert>
    );
  }
  
  if (promptNotFound) {
    return (
      <Alert variant="destructive" className="max-w-2xl mx-auto my-10">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Prompt Not Found</AlertTitle>
        <AlertDescription>
          The prompt ID <code className="font-mono bg-muted px-1 py-0.5 rounded">{currentPromptId}</code> was not found in this evaluation run.
          <Link href={`/analysis/${configIdFromUrl}/${runLabel}/${timestampFromUrl}`}>
            <Button variant="link" className="p-0 h-auto ml-1">Clear prompt selection</Button>
          </Link>
        </AlertDescription>
      </Alert>
    )
  }
  if (!data) return null; 

  const { 
      effectiveModels,
      evalMethodsUsed,
      promptIds,
      evaluationResults,
  } = data;

  const promptContexts = data.promptContexts; 
  const allFinalAssistantResponses = data.allFinalAssistantResponses; 

  const headerActions = data ? <DownloadResultsButton data={data} label={`${data.configTitle || configIdFromUrl} - ${data.runLabel || runLabel}${timestampFromUrl ? ' (' + formatTimestampForDisplay(fromSafeTimestamp(timestampFromUrl)) + ')' : ''}`} /> : null;

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-8">
        <AnalysisPageHeader 
            breadcrumbs={breadcrumbItems}
            pageTitle={pageTitle}
            contextualInfo={{
              configTitle: data.configTitle,
              runLabel: data.runLabel,
              timestamp: data.timestamp,
              description: data.description,
              tags: data.config?.tags
            }}
            actions={headerActions}
            headerWidget={headerWidgetContent}
        />

        {renderPromptSelector()}

        {currentPromptId && (
             <Card className="shadow-lg border-border dark:border-slate-700">
                <CardHeader>
                    <CardTitle className="text-primary dark:text-sky-400">Current Prompt Context</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                    {renderPromptDetails()}
                </CardContent>
            </Card>
        )}

        {!currentPromptId && (
            <DatasetStatistics
                promptStats={data.evaluationResults?.promptStatistics}
                overallSimilarityMatrix={data.evaluationResults?.similarityMatrix ?? undefined}
                overallIdealExtremes={overallIdealExtremes === null ? undefined : overallIdealExtremes}
                overallCoverageExtremes={overallCoverageExtremes === null ? undefined : overallCoverageExtremes}
                overallAvgCoverageStats={overallAvgCoverageStats === null ? undefined : overallAvgCoverageStats}
                modelsStrings={displayedModels}
                overallHybridExtremes={overallHybridExtremes === null ? undefined : overallHybridExtremes}
                promptTexts={promptTextsForMacroTable}
                allPromptIds={promptIds}
                overallAverageHybridScore={overallAverageHybridScore === null ? undefined : overallAverageHybridScore}
                overallHybridScoreStdDev={overallHybridScoreStdDev === null ? undefined : overallHybridScoreStdDev}
                allLlmCoverageScores={data.evaluationResults?.llmCoverageScores}
            />
        )}

        {currentPromptId && allFinalAssistantResponses && data.evaluationResults?.llmCoverageScores?.[currentPromptId] && allFinalAssistantResponses?.[currentPromptId]?.[IDEAL_MODEL_ID] && (
            <KeyPointCoverageComparisonDisplay
                coverageScores={data.evaluationResults.llmCoverageScores[currentPromptId] as Record<string, ImportedCoverageResult>}
                models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)} 
                promptResponses={allFinalAssistantResponses[currentPromptId]}
                idealModelId={IDEAL_MODEL_ID}
                promptId={currentPromptId}
                onModelClick={(modelId: string) => {
                    if (!allFinalAssistantResponses?.[currentPromptId] || !promptContexts?.[currentPromptId] || !data?.evaluationResults?.perPromptSimilarities?.[currentPromptId]) return;

                    const coverageScoresForPrompt = data.evaluationResults.llmCoverageScores?.[currentPromptId] as Record<string, ImportedCoverageResult> | undefined;
                    const coverageScore = coverageScoresForPrompt ? coverageScoresForPrompt[modelId] : null;
                    const pointAssessments = (coverageScore && !('error' in coverageScore)) ? coverageScore.pointAssessments : null;
                    
                    const semanticSim = data.evaluationResults.perPromptSimilarities?.[currentPromptId]?.[modelId]?.[IDEAL_MODEL_ID];
                    const contextForModal = promptContexts[currentPromptId];

                    setSelectedPairForModal({
                        modelA: modelId,
                        modelB: IDEAL_MODEL_ID,
                        promptId: currentPromptId,
                        promptContext: contextForModal,
                        responseA: allFinalAssistantResponses[currentPromptId][modelId] || '',
                        responseB: allFinalAssistantResponses[currentPromptId][IDEAL_MODEL_ID] || '',
                        systemPromptA: data.modelSystemPrompts?.[modelId] || null,
                        systemPromptB: data.modelSystemPrompts?.[IDEAL_MODEL_ID] || null,
                        semanticSimilarity: semanticSim,
                        llmCoverageScoreA: coverageScore,
                        llmCoverageScoreB: null, 
                        extractedKeyPoints: data.extractedKeyPoints?.[currentPromptId] || null,
                        pointAssessmentsA: pointAssessments || undefined,
                        pointAssessmentsB: undefined,
                    });
                    setIsModalOpen(true);
                }}
            />
        )}

        {currentPromptId && allFinalAssistantResponses && data.evaluationResults?.perPromptSimilarities?.[currentPromptId] && promptContexts?.[currentPromptId] && (
            <SemanticExtremesDisplay
                promptSimilarities={data.evaluationResults.perPromptSimilarities[currentPromptId]}
                models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                promptResponses={allFinalAssistantResponses[currentPromptId]}
                idealModelId={IDEAL_MODEL_ID}
                promptId={currentPromptId}
                onModelClick={(modelId: string) => {
                    if (!allFinalAssistantResponses?.[currentPromptId] || !promptContexts?.[currentPromptId]) return;

                    const coverageScoresForPrompt = data.evaluationResults?.llmCoverageScores?.[currentPromptId] as Record<string, ImportedCoverageResult> | undefined;
                    const coverageScore = coverageScoresForPrompt ? coverageScoresForPrompt[modelId] : null;
                    const pointAssessments = (coverageScore && !('error' in coverageScore)) ? coverageScore.pointAssessments : null;
                    const contextForModal = promptContexts[currentPromptId];
                    const semanticSim = data.evaluationResults?.perPromptSimilarities?.[currentPromptId]?.[modelId]?.[IDEAL_MODEL_ID];

                    setSelectedPairForModal({
                        modelA: modelId,
                        modelB: IDEAL_MODEL_ID,
                        promptId: currentPromptId,
                        promptContext: contextForModal,
                        responseA: allFinalAssistantResponses[currentPromptId][modelId] || '',
                        responseB: allFinalAssistantResponses[currentPromptId][IDEAL_MODEL_ID] || '',
                        systemPromptA: data.modelSystemPrompts?.[modelId] || null,
                        systemPromptB: data.modelSystemPrompts?.[IDEAL_MODEL_ID] || null,
                        semanticSimilarity: semanticSim,
                        llmCoverageScoreA: coverageScore,
                        llmCoverageScoreB: null,
                        extractedKeyPoints: data.extractedKeyPoints?.[currentPromptId] || null,
                        pointAssessmentsA: pointAssessments || undefined,
                        pointAssessmentsB: undefined,
                    });
                    setIsModalOpen(true);
                }}
            />
        )}

        {currentPromptId && evalMethodsUsed.includes('llm-coverage') && data.evaluationResults?.llmCoverageScores?.[currentPromptId] && (
            <Card className="shadow-lg border-border dark:border-slate-700 mt-6">
                <CardHeader>
                     <div className="flex justify-between items-center">
                        <CardTitle className="text-primary dark:text-sky-400">Key Point Coverage Details</CardTitle>
                        <Button variant="ghost" size="sm" title="Help: Key Point Coverage Table" asChild>
                            <Link href="#key-point-coverage-help" scroll={false}><HelpCircle className="w-4 h-4 text-muted-foreground" /></Link>
                        </Button>
                    </div>
                     <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                        Detailed breakdown of how each model response covers the evaluation criteria for prompt: <strong className="text-card-foreground dark:text-slate-200 font-normal">{currentPromptDisplayText}</strong>.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <KeyPointCoverageTable 
                        coverageScores={data.evaluationResults.llmCoverageScores[currentPromptId] as Record<string, ImportedCoverageResult>}
                        models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                        onCellClick={handleCoverageCellClick}
                        onModelHeaderClick={handleModelHeaderClickInKPCoverageTable}
                    />
                </CardContent>
            </Card>
        )}

      {/* Conditional rendering for Similarity views based on currentPromptId */}
      {currentPromptId && (
        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-lg border-border dark:border-slate-700 lg:col-span-2">
              <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="text-primary dark:text-sky-400">Model Similarity Matrix</CardTitle>
                    <Button variant="ghost" size="sm" title="Help: Similarity Matrix">
                        <HelpCircle className="w-4 h-4 text-muted-foreground" />
                    </Button>
                </div>
                <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                    Pairwise semantic similarity for prompt: <strong className='text-card-foreground dark:text-slate-200 font-normal'>{currentPromptDisplayText}</strong>. Darker means more similar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {safeMatrixForCurrentView && displayedModels.length > 0 ? (
                    <SimilarityHeatmap 
                        similarityMatrix={safeMatrixForCurrentView} 
                        models={displayedModels}
                        onCellClick={handleCellClick}
                    />
                ) : <p className="text-center text-muted-foreground dark:text-slate-400 py-4">Not enough data or models to display heatmap for this view.</p>}
              </CardContent>
            </Card>

            <Card className="shadow-lg border-border dark:border-slate-700 lg:col-span-2">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-primary dark:text-sky-400">Model Similarity Graph</CardTitle>
                         <Button variant="ghost" size="sm" title="Help: Similarity Graph">
                            <HelpCircle className="w-4 h-4 text-muted-foreground" />
                        </Button>
                    </div>
                    <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                        Force-directed graph based on semantic similarity for prompt: <strong className='text-card-foreground dark:text-slate-200 font-normal'>{currentPromptDisplayText}</strong>. Closer nodes are more similar.
                    </CardDescription>
                </CardHeader>
                <CardContent className="h-[400px]">
                     {safeMatrixForCurrentView && displayedModels.length > 1 ? (
                        <SimilarityGraph 
                            similarityMatrix={safeMatrixForCurrentView} 
                            models={displayedModels}
                            resolvedTheme={resolvedTheme}
                        />
                    ) : <p className="text-center text-muted-foreground dark:text-slate-400 py-4">Not enough data or models to display graph for this view.</p>}
                </CardContent>
            </Card>
          </div>

          <Card className="shadow-lg border-border dark:border-slate-700">
              <CardHeader>
                  <div className="flex justify-between items-center">
                      <CardTitle className="text-primary dark:text-sky-400">Model Similarity Dendrogram</CardTitle>
                      <Button variant="ghost" size="sm" title="Help: Dendrogram">
                          <HelpCircle className="w-4 h-4 text-muted-foreground" />
                      </Button>
                  </div>
                  <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                      Models clustered by semantic similarity for prompt: <strong className='text-card-foreground dark:text-slate-200 font-normal'>{currentPromptDisplayText}</strong>. Shorter branches mean more similar.
                  </CardDescription>
              </CardHeader>
              <CardContent className="h-[450px] overflow-x-auto custom-scrollbar">
                  {safeMatrixForCurrentView && displayedModels.length > 1 ? (
                      <DendrogramChart 
                          similarityMatrix={safeMatrixForCurrentView} 
                          models={displayedModels}
                      />
                  ) : <p className="text-center text-muted-foreground dark:text-slate-400 py-4">Not enough data or models to display dendrogram.</p>}
              </CardContent>
          </Card>
        </div>
      )}

      {evalMethodsUsed.includes('llm-coverage') && data.evaluationResults?.llmCoverageScores && (
        <>
            { !currentPromptId && calculatedPerModelHybridScores.size > 0 && displayedModels.length > 0 && (
                <PerModelHybridScoresCard
                    perModelHybridScores={calculatedPerModelHybridScores}
                    perModelSemanticSimilarityScores={calculatedPerModelSemanticScores}
                    modelIds={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                />
            )}

            {!currentPromptId && (
                <Card className="shadow-lg border-border dark:border-slate-700">
                    <CardHeader>
                         <div className="flex justify-between items-center">
                            <CardTitle className="text-primary dark:text-sky-400">Macro Coverage Overview</CardTitle>
                             <Button variant="ghost" size="sm" title="Help: Macro Coverage Table" asChild>
                                <Link href="#macro-coverage-help" scroll={false}><HelpCircle className="w-4 h-4 text-muted-foreground" /></Link>
                            </Button>
                        </div>
                        <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                            Average key point coverage extent for each model across all prompts. Click cell segments for detailed breakdown.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <MacroCoverageTable 
                            allCoverageScores={data.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>}
                            promptIds={promptIds}
                            promptTexts={promptTextsForMacroTable} 
                            models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                            configId={configIdFromUrl}
                            runLabel={runLabel}
                            safeTimestampFromParams={timestampFromUrl}
                            onCellClick={handleMacroCellClick} 
                        />
                    </CardContent>
                </Card>
            )}

            {!currentPromptId && data?.evaluationResults?.similarityMatrix && displayedModels && displayedModels.length > 1 && (
              <>
                <Card className="shadow-lg border-border dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-primary dark:text-sky-400">Model Similarity Graph</CardTitle>
                    <CardDescription>
                      Force-directed graph showing relationships based on semantic similarity of model responses across all prompts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[600px] w-full">
                      <SimilarityGraph 
                        similarityMatrix={data.evaluationResults.similarityMatrix}
                        models={displayedModels}
                        resolvedTheme={resolvedTheme}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-lg border-border dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-primary dark:text-sky-400">Model Similarity Dendrogram</CardTitle>
                    <CardDescription>
                      Hierarchical clustering of models based on response similarity. Models grouped closer are more similar.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                     <div className="h-[600px] w-full">
                      <DendrogramChart 
                        similarityMatrix={data.evaluationResults.similarityMatrix}
                        models={displayedModels}
                      />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
        </>
      )}
        <DebugPanel 
            data={data} 
            configId={configIdFromUrl}
            runLabel={runLabel}
            timestamp={timestampFromUrl}
        />

      {selectedPairForModal && (
        <ResponseComparisonModal 
          isOpen={isModalOpen} 
          onClose={handleCloseModal} 
          {...selectedPairForModal}
        />
      )}
      {modelEvaluationDetailModalData && (
        <ModelEvaluationDetailModal
          isOpen={isModelEvaluationDetailModalOpen}
          onClose={handleCloseModelEvaluationDetailModal}
          data={modelEvaluationDetailModalData}
        />
      )}
    </div>
  );
} 