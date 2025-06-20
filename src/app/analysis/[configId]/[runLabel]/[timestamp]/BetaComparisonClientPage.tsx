'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import SimilarityHeatmap from '@/app/analysis/components/SimilarityHeatmap'
import SimilarityGraph from '@/app/analysis/components/SimilarityGraph'
import DendrogramChart from '@/app/analysis/components/DendrogramChart'
import { ResponseComparisonModal } from '@/app/analysis/components/ResponseComparisonModal'
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
    calculateAverageHybridScoreForRun,
    findIdealExtremes
} from '@/app/utils/calculationUtils';

import { useTheme } from 'next-themes';
import DownloadResultsButton from '@/app/analysis/components/DownloadResultsButton';
import PerModelHybridScoresCard from '@/app/analysis/components/PerModelHybridScoresCard';
import AnalysisPageHeader from '@/app/analysis/components/AnalysisPageHeader';
import type { AnalysisPageHeaderProps } from '@/app/analysis/components/AnalysisPageHeader';
import { fromSafeTimestamp, formatTimestampForDisplay } from '@/lib/timestampUtils';
import ModelEvaluationDetailModal from '@/app/analysis/components/ModelEvaluationDetailModal';
import DebugPanel from '@/app/analysis/components/DebugPanel';
import CoverageHeatmapCanvas from '@/app/analysis/components/CoverageHeatmapCanvas';
import { Badge } from '@/components/ui/badge';
import { getModelDisplayLabel, parseEffectiveModelId, getCanonicalModels } from '@/app/utils/modelIdUtils';
import { BLUEPRINT_CONFIG_REPO_URL } from '@/lib/configConstants';
import { useComparisonData } from '@/app/analysis/hooks/useComparisonData';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"

const AlertCircle = dynamic(() => import("lucide-react").then((mod) => mod.AlertCircle))
const XCircle = dynamic(() => import("lucide-react").then((mod) => mod.XCircle))
const Loader2 = dynamic(() => import("lucide-react").then((mod) => mod.Loader2))
const HelpCircle = dynamic(() => import("lucide-react").then(mod => mod.HelpCircle))
const CheckCircle2 = dynamic(() => import("lucide-react").then((mod) => mod.CheckCircle2))
const GitCommit = dynamic(() => import("lucide-react").then((mod) => mod.GitCommit))
const AlertTriangle = dynamic(() => import("lucide-react").then((mod) => mod.AlertTriangle))

const getHybridScoreColorClass = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return 'bg-muted/30 text-muted-foreground dark:text-slate-400';
    if (score >= 0.75) return 'bg-highlight-success/80 text-white dark:text-slate-50';
    if (score >= 0.50) return 'bg-highlight-warning/80 text-white dark:text-slate-50';
    if (score > 0) return 'bg-highlight-error/80 text-white dark:text-slate-50';
    return 'bg-muted/80 text-white dark:text-slate-50';
};

interface ModelEvaluationDetailModalData {
  modelId: string;
  assessments: ImportedPointAssessment[];
  promptContext: string | ConversationMessage[];
  promptDescription?: string;
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

  const { data, loading, error, promptNotFound, excludedModelsList } = useComparisonData({
    configId: configIdFromUrl,
    runLabel,
    timestamp: timestampFromUrl,
    currentPromptId,
  });

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedPairForModal, setSelectedPairForModal] = useState<ImportedSelectedPairInfo | null>(null);
  const [forceIncludeExcludedModels, setForceIncludeExcludedModels] = useState<boolean>(false);
  const [selectedTemperatures, setSelectedTemperatures] = useState<number[]>([]);
  const [activeSysPromptIndex, setActiveSysPromptIndex] = useState(0);

  const displayedModels = useMemo(() => {
    if (!data?.effectiveModels) return [];
    if (forceIncludeExcludedModels) {
        return data.effectiveModels;
    }
    return (data.effectiveModels || []).filter((m: string) => !excludedModelsList.includes(m));
  }, [data?.effectiveModels, excludedModelsList, forceIncludeExcludedModels]);

  const modelsForMacroTable = useMemo(() => {
    if (!data) return [];
    
    let models = displayedModels;

    // Filter by the active system prompt tab if it's a permutation run
    if (data.config.systems && data.config.systems.length > 1) {
        models = models.filter(modelId => {
            const { systemPromptIndex } = parseEffectiveModelId(modelId);
            // Models without an index are not part of any permutation tab.
            return systemPromptIndex === activeSysPromptIndex;
        });
    }

    // Further filter by temperature if a selection has been made
    if (selectedTemperatures.length > 0) {
        models = models.filter(modelId => {
            const { temperature } = parseEffectiveModelId(modelId);
            return temperature === undefined || selectedTemperatures.includes(temperature);
        });
    }

    return models;
  }, [displayedModels, activeSysPromptIndex, selectedTemperatures, data]);

  const modelsForAggregateView = useMemo(() => {
    if (!data) return [];
    // For aggregate views, we want a cleaner, canonical list of models.
    // We pass the *original* effectiveModels list to the canonical function, not the one that may have exclusions.
    return getCanonicalModels(data.effectiveModels, data.config);
  }, [data]);

  const { 
    overallIdealExtremes, 
    overallAvgCoverageStats, 
    overallCoverageExtremes, 
    overallHybridExtremes,
    overallRunHybridStats,
    calculatedPerModelHybridScores,
    calculatedPerModelSemanticScores,
    perSystemVariantHybridScores,
    perTemperatureVariantHybridScores
  } = useMemo(() => {
    if (!data) {
      return {
        overallIdealExtremes: null,
        overallAvgCoverageStats: null,
        overallCoverageExtremes: null,
        overallHybridExtremes: null,
        overallRunHybridStats: { average: null, stddev: null },
        calculatedPerModelHybridScores: new Map(),
        calculatedPerModelSemanticScores: new Map(),
        perSystemVariantHybridScores: {},
        perTemperatureVariantHybridScores: {}
      };
    }

    const { evaluationResults, effectiveModels, promptIds, config } = data;
    const llmCoverageScores = evaluationResults?.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>> | undefined;

    const overallIdealExtremes = evaluationResults?.similarityMatrix ? findIdealExtremes(evaluationResults.similarityMatrix, IDEAL_MODEL_ID) : null;
    
    const overallAvgCoverageStats = (llmCoverageScores && effectiveModels && promptIds) 
      ? importedCalculateOverallAverageCoverage(llmCoverageScores, effectiveModels, promptIds) 
      : null;

    const overallCoverageExtremes = (llmCoverageScores && effectiveModels) 
      ? importedCalculateOverallCoverageExtremes(llmCoverageScores, effectiveModels) 
      : null;

    const overallHybridExtremes = (evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels)
      ? importedCalculateHybridScoreExtremes(evaluationResults.perPromptSimilarities, llmCoverageScores, effectiveModels, IDEAL_MODEL_ID)
      : null;

    const overallRunHybridStats = (evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels && promptIds)
      ? calculateAverageHybridScoreForRun(evaluationResults.perPromptSimilarities, llmCoverageScores, effectiveModels, promptIds, IDEAL_MODEL_ID)
      : { average: null, stddev: null };

    let calculatedPerModelHybridScores = new Map<string, { average: number | null; stddev: number | null }>();
    if (evaluationResults?.perModelHybridScores) {
      let scoresToSet = evaluationResults.perModelHybridScores;
      if (typeof scoresToSet === 'object' && !(scoresToSet instanceof Map)) {
        scoresToSet = new Map(Object.entries(scoresToSet));
      }
      calculatedPerModelHybridScores = scoresToSet as Map<string, { average: number | null; stddev: number | null }>;
    }
    
    let calculatedPerModelSemanticScores = new Map<string, { average: number | null; stddev: number | null }>();
    if (evaluationResults?.perModelSemanticScores) {
      let scoresToSet = evaluationResults.perModelSemanticScores;
      if (typeof scoresToSet === 'object' && !(scoresToSet instanceof Map)) {
        scoresToSet = new Map(Object.entries(scoresToSet));
      }
      calculatedPerModelSemanticScores = scoresToSet as Map<string, { average: number | null; stddev: number | null }>;
    }

    const perSystemVariantHybridScores: Record<number, number | null> = {};
    if (config.systems && config.systems.length > 1 && evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels && promptIds) {
        for (let i = 0; i < config.systems.length; i++) {
            const modelsForVariant = effectiveModels.filter(modelId => {
                const { systemPromptIndex } = parseEffectiveModelId(modelId);
                return systemPromptIndex === i;
            });

            if (modelsForVariant.length > 0) {
                const hybridStatsForVariant = calculateAverageHybridScoreForRun(
                    evaluationResults.perPromptSimilarities, llmCoverageScores, modelsForVariant, promptIds, IDEAL_MODEL_ID
                );
                perSystemVariantHybridScores[i] = hybridStatsForVariant?.average ?? null;
            } else {
                perSystemVariantHybridScores[i] = null;
            }
        }
    }
    
    const perTemperatureVariantHybridScores: Record<string, number | null> = {};
    if (config.temperatures && config.temperatures.length > 1 && evaluationResults?.perPromptSimilarities && llmCoverageScores && effectiveModels && promptIds) {
        for (const temp of config.temperatures) {
            const modelsForTemp = effectiveModels.filter(modelId => {
                const { temperature } = parseEffectiveModelId(modelId);
                return temperature === temp;
            });

            if (modelsForTemp.length > 0) {
                const hybridStatsForTemp = calculateAverageHybridScoreForRun(
                    evaluationResults.perPromptSimilarities, llmCoverageScores, modelsForTemp, promptIds, IDEAL_MODEL_ID
                );
                perTemperatureVariantHybridScores[temp.toFixed(1)] = hybridStatsForTemp?.average ?? null;
            } else {
                perTemperatureVariantHybridScores[temp.toFixed(1)] = null;
            }
        }
    }
    
    return { 
        overallIdealExtremes, 
        overallAvgCoverageStats,
        overallCoverageExtremes,
        overallHybridExtremes,
        overallRunHybridStats,
        calculatedPerModelHybridScores,
        calculatedPerModelSemanticScores,
        perSystemVariantHybridScores,
        perTemperatureVariantHybridScores
    };
  }, [data]);
  
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
    const promptConfig = data.config.prompts.find(p => p.id === currentPromptId);

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
      promptDescription: promptConfig?.description,
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
    const promptConfig = data.config.prompts.find(p => p.id === currentPromptId);

    const renderContent = () => {
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
    }

    return (
        <div className="space-y-4">
            {promptConfig?.description && ReactMarkdown && RemarkGfm && (
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1">
                    <ReactMarkdown remarkPlugins={[RemarkGfm]}>{promptConfig.description}</ReactMarkdown>
                </div>
            )}
            {renderContent()}
        </div>
    )
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
    const promptConfig = data.config.prompts.find(p => p.id === currentPromptId);

    if (!modelResult || 'error' in modelResult || !modelResult.pointAssessments) {
        console.warn(`No valid assessments found for ${clickedModelId} on prompt ${currentPromptId}`);
        return;
    }
    
    const modalData: ModelEvaluationDetailModalData = {
        modelId: clickedModelId,
        assessments: modelResult.pointAssessments,
        promptContext: data.promptContexts[currentPromptId],
        promptDescription: promptConfig?.description,
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
    const promptConfig = data.config.prompts.find(p => p.id === promptId);

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
        promptDescription: promptConfig?.description,
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
      const promptConfig = data.config.prompts.find(p => p.id === firstPromptId);
      
      const modalData: ModelEvaluationDetailModalData = {
          modelId: modelId,
          assessments: (modelResult && !('error' in modelResult)) ? modelResult.pointAssessments || [] : [],
          promptContext: data.promptContexts?.[firstPromptId] || `Context for ${firstPromptId} not found.`,
          promptDescription: promptConfig?.description,
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

  const headerActions = data ? (
    <div className="flex items-center gap-2">
        {data.sourceCommitSha ? (
            <Button asChild variant="outline">
                <Link href={`${BLUEPRINT_CONFIG_REPO_URL}/blob/${data.sourceCommitSha}/blueprints/${data.configId}.json`} target="_blank" rel="noopener noreferrer" title={`View blueprint at commit ${data.sourceCommitSha.substring(0, 7)}`}>
                    <GitCommit className="w-4 h-4 mr-2" />
                    View Blueprint on GitHub
                </Link>
            </Button>
        ) : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button asChild variant="outline">
                      <Link href={`${BLUEPRINT_CONFIG_REPO_URL}/blob/main/blueprints/${data.configId}.json`} target="_blank" rel="noopener noreferrer">
                          <GitCommit className="w-4 h-4 mr-2" />
                          View Latest Blueprint
                      </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-2 text-amber-500" />
                    <p>Links to latest version, not the exact one from this run.</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
        )}
        <DownloadResultsButton data={data} label={`${data.configTitle || configIdFromUrl} - ${data.runLabel || runLabel}${timestampFromUrl ? ' (' + formatTimestampForDisplay(fromSafeTimestamp(timestampFromUrl)) + ')' : ''}`} />
        <Button asChild variant="outline">
            <Link href={`/api/comparison/${configIdFromUrl}/${runLabel}/${timestampFromUrl}/markdown`} download>
                Download Markdown
            </Link>
        </Button>
    </div>
  ) : null;

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

        {data?.config?.systems && data.config.systems.length > 1 && (
            <Card className="shadow-lg border-border dark:border-slate-700">
                <CardHeader>
                <CardTitle className="text-primary text-primary">System Prompt Variants</CardTitle>
                <CardDescription>This run was executed against the following system prompt variations.</CardDescription>
                </CardHeader>
                <CardContent>
                <ul className="space-y-3">
                    {data.config.systems.map((systemPrompt, index) => (
                    <li key={index} className="flex items-start gap-3 p-2 rounded-md bg-muted/50 dark:bg-slate-800/30">
                        <Badge variant="secondary" className="mt-1">{`sp_idx:${index}`}</Badge>
                        <div className="text-sm text-card-foreground dark:text-slate-200">
                        {systemPrompt === null ? (
                            <em className="text-muted-foreground">[No System Prompt]</em>
                        ) : (
                            <p className="whitespace-pre-wrap font-mono">{systemPrompt}</p>
                        )}
                        </div>
                    </li>
                    ))}
                </ul>
                </CardContent>
            </Card>
        )}

        {excludedModelsList.length > 0 && !currentPromptId && !forceIncludeExcludedModels && (
             <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Models Automatically Excluded</AlertTitle>
                <AlertDescription>
                    <div className="flex justify-between items-start gap-4">
                        <div>
                            The following models were excluded from this overall analysis because they returned at least one empty response. This is done to prevent skewed aggregate scores. You can still see their results by selecting an individual prompt.
                            <ul className="list-disc pl-6 mt-2 space-y-1">
                                {excludedModelsList.map(modelId => (
                                    <li key={modelId}>
                                        <code className="font-mono text-sm bg-muted text-foreground px-1.5 py-1 rounded">
                                            {getModelDisplayLabel(parseEffectiveModelId(modelId))}
                                        </code>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="ml-4 flex-shrink-0"
                            onClick={() => setForceIncludeExcludedModels(true)}
                        >
                            Show Anyway
                        </Button>
                    </div>
                </AlertDescription>
            </Alert>
        )}

        {forceIncludeExcludedModels && !currentPromptId && excludedModelsList.length > 0 && (
            <Alert variant="default" className="border-amber-500/50 dark:border-amber-400/30 bg-amber-50/50 dark:bg-amber-900/10">
                <AlertTriangle className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                <AlertTitle className="text-amber-700 dark:text-amber-300">Displaying Models with Incomplete Data</AlertTitle>
                <AlertDescription className="text-amber-900 dark:text-amber-400/90">
                    You are viewing models that had empty responses for some prompts. 
                    Aggregate scores for these models ({excludedModelsList.map(modelId => `"${getModelDisplayLabel(parseEffectiveModelId(modelId))}"`).join(', ')}) 
                    are calculated only from the prompts they responded to and may not be directly comparable to other models.
                    <Button variant="link" className="p-0 h-auto ml-2 text-primary text-primary font-semibold" onClick={() => setForceIncludeExcludedModels(false)}>
                        (Re-hide incomplete models)
                    </Button>
                </AlertDescription>
            </Alert>
        )}

        {currentPromptId && (
             <Card className="shadow-lg border-border dark:border-slate-700">
                <CardHeader>
                    <CardTitle className="text-primary text-primary">Current Prompt Context</CardTitle>
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
                overallAverageHybridScore={overallRunHybridStats?.average === null ? undefined : overallRunHybridStats?.average}
                overallHybridScoreStdDev={overallRunHybridStats?.stddev === null ? undefined : overallRunHybridStats?.stddev}
                allLlmCoverageScores={data.evaluationResults?.llmCoverageScores}
            />
        )}

        {!evalMethodsUsed.includes('llm-coverage') && (
            <div className="my-6">
                <Alert variant="default" className="border-sky-500/50 dark:border-sky-400/30 bg-sky-50/50 dark:bg-sky-900/10">
                    <HelpCircle className="h-4 w-4 text-sky-600 text-primary" />
                    <AlertTitle className="text-sky-800 dark:text-sky-300">Coverage Analysis Not Available</AlertTitle>
                    <AlertDescription className="text-sky-900 text-primary/90">
                        The 'llm-coverage' evaluation method was not included in this run. Therefore, the Macro Coverage Overview and other rubric-based analyses are not available. To enable this analysis, include 'llm-coverage' in the `--eval-method` flag when executing the run.
                    </AlertDescription>
                </Alert>
            </div>
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
                        <CardTitle className="text-primary text-primary">Key Point Coverage Details</CardTitle>
                        <Button variant="ghost" size="sm" title="Help: Key Point Coverage Table" asChild>
                            <Link href="#key-point-coverage-help" scroll={false}><HelpCircle className="w-4 h-4 text-muted-foreground" /></Link>
                        </Button>
                    </div>
                     <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                        Detailed breakdown of how each model response covers the evaluation criteria for prompt: <strong className="text-card-foreground dark:text-slate-200 font-normal">{currentPromptDisplayText}</strong>.
                    </CardDescription>

                    {/* Variant Filters moved here for better usability */}
                    {!currentPromptId && (data?.config.temperatures || data?.config.systems) && (
                        <div className="pt-4 mt-4 border-t border-border/50 dark:border-slate-700/50">
                            <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                                {data.config.temperatures && data.config.temperatures.length > 1 && (
                                    <div>
                                        <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Temperatures</label>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {data.config.temperatures.map(temp => (
                                                <Button
                                                    key={temp}
                                                    size="sm"
                                                    variant={selectedTemperatures.includes(temp) ? "default" : "outline"}
                                                    onClick={() => {
                                                        setSelectedTemperatures(prev =>
                                                            prev.includes(temp) ? prev.filter(t => t !== temp) : [...prev, temp]
                                                        );
                                                    }}
                                                >
                                                    {(() => {
                                                        const score = (perTemperatureVariantHybridScores as Record<string, number | null>)[temp.toFixed(1)];
                                                        if (score !== null && score !== undefined) {
                                                            return (
                                                                <>
                                                                    <span className={`px-1.5 py-0.5 rounded-sm text-xs font-semibold ${getHybridScoreColorClass(score)}`}>
                                                                        {score.toFixed(2)}
                                                                    </span>
                                                                    <span>{temp.toFixed(1)}</span>
                                                                </>
                                                            );
                                                        }
                                                        return temp.toFixed(1);
                                                    })()}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {data.config.systems && data.config.systems.length > 1 && (
                                    <div>
                                        <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">System Prompts</label>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {data.config.systems.map((_, index) => (
                                                <Button
                                                    key={index}
                                                    size="sm"
                                                    variant={selectedTemperatures.includes(index) ? "default" : "outline"}
                                                    onClick={() => {
                                                        setSelectedTemperatures(prev =>
                                                            prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
                                                        );
                                                    }}
                                                >
                                                    {`sp_idx:${index}`}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {(selectedTemperatures.length > 0 || selectedTemperatures.length > 0) && (
                                    <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => {
                                        setSelectedTemperatures([]);
                                    }}>Reset Filters</Button>
                                )}
                            </div>
                        </div>
                    )}
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
                    <CardTitle className="text-primary text-primary">Model Similarity Matrix</CardTitle>
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
                        <CardTitle className="text-primary text-primary">Model Similarity Graph</CardTitle>
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
                      <CardTitle className="text-primary text-primary">Model Similarity Dendrogram</CardTitle>
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
                            <CardTitle className="text-primary text-primary">Macro Coverage Overview</CardTitle>
                             <Button variant="ghost" size="sm" title="Help: Macro Coverage Table" asChild>
                                <Link href="#macro-coverage-help" scroll={false}><HelpCircle className="w-4 h-4 text-muted-foreground" /></Link>
                            </Button>
                        </div>
                        <CardDescription className="text-muted-foreground dark:text-slate-400 pt-1 text-sm">
                            {data.config.systems && data.config.systems.length > 1 
                                ? "Average key point coverage, broken down by system prompt variant. Select a tab to view its results."
                                : "Average key point coverage extent for each model across all prompts."
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                        {data.config.systems && data.config.systems.length > 1 ? (
                            <Tabs defaultValue={"0"} onValueChange={(value) => setActiveSysPromptIndex(parseInt(value, 10))} className="pt-4">
                                <TabsList className={`grid w-full ${data.config.systems.length > 4 ? 'grid-cols-4' : `grid-cols-${data.config.systems.length}`}`}>
                                    {data.config.systems.map((systemPrompt, index) => {
                                        const truncatedPrompt = systemPrompt
                                            ? `: "${systemPrompt.substring(0, 20)}${systemPrompt.length > 20 ? '...' : ''}"`
                                            : ': [No Prompt]';
                                        
                                        const score = (perSystemVariantHybridScores as Record<number, number | null>)[index];
                                        const tabLabel = `Sys. Variant ${index}${truncatedPrompt}`;

                                        return (
                                            <TooltipProvider key={index}>
                                                <Tooltip>
                                                    <TabsTrigger asChild value={String(index)}>
                                                        <TooltipTrigger asChild>
                                                            <div className="truncate flex items-center justify-center gap-2 w-full px-1">
                                                                {score !== null && score !== undefined && (
                                                                    <span className={`px-1.5 py-0.5 rounded-sm text-xs font-semibold ${getHybridScoreColorClass(score)}`}>
                                                                        {score.toFixed(2)}
                                                                    </span>
                                                                )}
                                                                <span className="flex-shrink truncate">{tabLabel}</span>
                                                            </div>
                                                        </TooltipTrigger>
                                                    </TabsTrigger>
                                                    <TooltipContent>
                                                        <p className="max-w-xs text-sm">
                                                            {systemPrompt === null ? <em>[No SystemPrompt]</em> : systemPrompt}
                                                        </p>
                                                    </TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        );
                                    })}
                                </TabsList>
                                <div className="mt-4">
                                    {/* Temperature Filter UI */}
                                    {data.config.temperatures && data.config.temperatures.length > 1 && (
                                        <div className="py-4 border-t border-b mb-4">
                                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                                                <div>
                                                    <label className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Filter Temperatures</label>
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        {data.config.temperatures.map(temp => (
                                                            <Button
                                                                key={temp}
                                                                size="sm"
                                                                variant={selectedTemperatures.includes(temp) ? "default" : "outline"}
                                                                className="flex items-center gap-2"
                                                                onClick={() => {
                                                                    setSelectedTemperatures(prev =>
                                                                        prev.includes(temp) ? prev.filter(t => t !== temp) : [...prev, temp]
                                                                    );
                                                                }}
                                                            >
                                                                {(() => {
                                                                    const score = (perTemperatureVariantHybridScores as Record<string, number | null>)[temp.toFixed(1)];
                                                                    if (score !== null && score !== undefined) {
                                                                        return (
                                                                            <>
                                                                                <span className={`px-1.5 py-0.5 rounded-sm text-xs font-semibold ${getHybridScoreColorClass(score)}`}>
                                                                                    {score.toFixed(2)}
                                                                                </span>
                                                                                <span>{temp.toFixed(1)}</span>
                                                                            </>
                                                                        );
                                                                    }
                                                                    return temp.toFixed(1);
                                                                })()}
                                                            </Button>
                                                        ))}
                                                    </div>
                                                </div>
                                                {(selectedTemperatures.length > 0) && (
                                                    <Button variant="link" size="sm" className="p-0 h-auto text-xs self-end" onClick={() => setSelectedTemperatures([])}>
                                                        Reset
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <MacroCoverageTable 
                                        allCoverageScores={data.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>}
                                        promptIds={promptIds}
                                        promptTexts={promptTextsForMacroTable} 
                                        models={modelsForMacroTable.filter(m => m !== IDEAL_MODEL_ID)}
                                        allFinalAssistantResponses={allFinalAssistantResponses}
                                        configId={configIdFromUrl}
                                        runLabel={runLabel}
                                        safeTimestampFromParams={timestampFromUrl}
                                        onCellClick={handleMacroCellClick} 
                                    />
                                </div>
                            </Tabs>
                        ) : (
                            <MacroCoverageTable 
                                allCoverageScores={data.evaluationResults.llmCoverageScores as Record<string, Record<string, ImportedCoverageResult>>}
                                promptIds={promptIds}
                                promptTexts={promptTextsForMacroTable} 
                                models={displayedModels.filter(m => m !== IDEAL_MODEL_ID)}
                                allFinalAssistantResponses={allFinalAssistantResponses}
                                configId={configIdFromUrl}
                                runLabel={runLabel}
                                safeTimestampFromParams={timestampFromUrl}
                                onCellClick={handleMacroCellClick} 
                            />
                        )}
                    </CardContent>
                </Card>
            )}

            {!currentPromptId && data?.evaluationResults?.similarityMatrix && modelsForAggregateView && modelsForAggregateView.length > 1 && (
              <>
                <Card className="shadow-lg border-border dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-primary text-primary">Model Similarity Graph</CardTitle>
                    <CardDescription>
                      Force-directed graph showing relationships based on semantic similarity of model responses across all prompts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[600px] w-full">
                      <SimilarityGraph 
                        similarityMatrix={data.evaluationResults.similarityMatrix}
                        models={modelsForAggregateView}
                        resolvedTheme={resolvedTheme}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-lg border-border dark:border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-primary text-primary">Model Similarity Dendrogram</CardTitle>
                    <CardDescription>
                      Hierarchical clustering of models based on response similarity. Models grouped closer are more similar.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                     <div className="h-[600px] w-full">
                      <DendrogramChart 
                        similarityMatrix={data.evaluationResults.similarityMatrix}
                        models={modelsForAggregateView}
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