'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import Link from 'next/link';
import { MarkdownAccordion } from '@/app/analysis/components/MarkdownAccordion';
import { StructuredSummary } from '@/app/analysis/components/StructuredSummary';
import { getModelDisplayLabel, parseEffectiveModelId } from '@/app/utils/modelIdUtils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { prettifyTag, normalizeTag } from '@/app/utils/tagUtils';
import { Badge } from '@/components/ui/badge';
import { useUnifiedAnalysis } from '../hooks/useUnifiedAnalysis';
import { cn } from '@/lib/utils';
import PromptContextDisplay from './PromptContextDisplay';
import { IDEAL_MODEL_ID } from '@/app/utils/calculationUtils';
import Icon from '@/components/ui/icon';
// import { usePreloadIcons } from '@/components/ui/use-preload-icons';

import ReactMarkdown from 'react-markdown';
import RemarkGfmPlugin from 'remark-gfm';

export interface AnalysisPageHeaderProps {
  actions?: React.ReactNode;
  headerWidget?: React.ReactNode;
  children?: React.ReactNode;
  isSticky?: boolean;
}

// Component for overall summary stats (aggregate view) - now with leaderboard
const SummaryStatsTable = () => {
  const { summaryStats, data, openModelPerformanceModal, openPromptDetailModal } = useUnifiedAnalysis();

  if (!summaryStats) return null;

  const { modelLeaderboard, mostDifferentiatingPrompt, mostSimilarPair } = summaryStats;

  // Detect variations and build appropriate title
  const hasMultipleSystemPrompts = data?.config?.systems && data.config.systems.length > 1;
  const hasMultipleTemperatures = data?.config?.temperatures && data.config.temperatures.length > 1;
  
  let scoreTypeText = 'Coverage';
  let scoreTooltipText = 'Based on key point coverage scores across all prompts.';
  
  if (hasMultipleSystemPrompts && hasMultipleTemperatures) {
    scoreTypeText = `Coverage across ${data?.config?.systems?.length || 0} system variations & ${data?.config?.temperatures?.length || 0} temperatures`;
    scoreTooltipText = 'Scores are averaged across all system prompt and temperature variations for each model.';
  } else if (hasMultipleSystemPrompts) {
    scoreTypeText = `Coverage across ${data?.config?.systems?.length || 0} system variations`;
    scoreTooltipText = 'Scores are averaged across all system prompt variations for each model.';
  } else if (hasMultipleTemperatures) {
    scoreTypeText = `Coverage across ${data?.config?.temperatures?.length || 0} temperatures`;
    scoreTooltipText = 'Scores are averaged across all temperature variations for each model.';
  }

  return (
    <div className="mb-2">
      {/* Model Leaderboard */}
      {modelLeaderboard && modelLeaderboard.length > 0 && (
        <div className="bg-card/50 dark:bg-slate-800/30 rounded-lg p-4 border border-border/50 mb-4">
          <div className="flex items-start justify-between mb-3">
                         <h3 className="text-sm font-semibold text-foreground flex items-center">
               <Icon name="trophy" className="w-4 h-4 mr-2 text-primary" />
               Best Models ({scoreTypeText})
             </h3>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Icon name="info" className="w-4 h-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>{scoreTooltipText}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <ul className="space-y-2">
            {modelLeaderboard.map((model, index) => (
              <li 
                key={model.id} 
                className="flex items-center justify-between text-sm border-b border-border/30 dark:border-slate-700/30 pb-1.5 last:border-b-0 last:pb-0"
              >
                <div className="flex items-center">
                  <span className="mr-2.5 w-6 text-right text-muted-foreground font-medium">{index + 1}.</span>
                  {index < 3 && (
                    <Icon 
                      name="award" 
                      className={`w-3.5 h-3.5 mr-1.5 ${
                        index === 0 ? 'text-amber-400' : 
                        index === 1 ? 'text-slate-400' : 
                        'text-amber-700/80'
                      }`} 
                    />
                  )}
                  <span 
                    className="font-medium text-card-foreground hover:text-primary cursor-pointer underline-offset-2 hover:underline" 
                    title={model.id}
                    onClick={() => openModelPerformanceModal(model.id)}
                  >
                    {getModelDisplayLabel(model.id, {
                      hideProvider: true,
                      hideModelMaker: true,
                      hideSystemPrompt: true,
                      hideTemperature: true,
                      prettifyModelName: true
                    })}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-primary">
                    {(model.score * 100).toFixed(1)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Additional insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {mostDifferentiatingPrompt && (
          <div className="bg-card/50 dark:bg-slate-800/30 rounded-lg p-3 border border-border/50">
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                🤔 Most Differentiating Prompt
              </span>
            </div>
            <div 
              className="text-sm font-medium text-foreground cursor-pointer hover:text-primary underline-offset-2 hover:underline truncate"
              onClick={() => openPromptDetailModal(mostDifferentiatingPrompt.id)}
              title={mostDifferentiatingPrompt.text || mostDifferentiatingPrompt.id}
            >
              {mostDifferentiatingPrompt.text || mostDifferentiatingPrompt.id}
            </div>
            <div className="text-xs text-primary font-mono mt-1">
              σ = {mostDifferentiatingPrompt.score.toFixed(3)}
            </div>
          </div>
        )}

        {mostSimilarPair && (
          <div className="bg-card/50 dark:bg-slate-800/30 rounded-lg p-3 border border-border/50">
            <div className="flex items-start justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                👯 Most Similar Models
              </span>
            </div>
            <div className="text-sm font-medium text-foreground">
              <span 
                className="cursor-pointer hover:text-primary underline-offset-2 hover:underline"
                onClick={() => openModelPerformanceModal(mostSimilarPair.pair[0])}
              >
                {getModelDisplayLabel(mostSimilarPair.pair[0], { hideProvider: true, prettifyModelName: true })}
              </span>
              <span className="mx-1 text-muted-foreground">vs</span>
              <span 
                className="cursor-pointer hover:text-primary underline-offset-2 hover:underline"
                onClick={() => openModelPerformanceModal(mostSimilarPair.pair[1])}
              >
                {getModelDisplayLabel(mostSimilarPair.pair[1], { hideProvider: true, prettifyModelName: true })}
              </span>
            </div>
            <div className="text-xs text-primary font-mono mt-1">
              {(mostSimilarPair.value * 100).toFixed(1)}% similarity
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Component for prompt-specific stats (single prompt view)
const PromptSpecificStatsTable = () => {
  const { data, currentPromptId, displayedModels, openModelPerformanceModal } = useUnifiedAnalysis();

  const promptStats = useMemo(() => {
    if (!data || !currentPromptId || !data.evaluationResults?.llmCoverageScores) return null;

    const promptCoverageScores = data.evaluationResults.llmCoverageScores[currentPromptId];
    
    if (!promptCoverageScores) return null;

    const nonIdealModels = displayedModels.filter(m => m !== IDEAL_MODEL_ID);
    
    // Group by canonical model name and average across variants
    const canonicalModelScores = new Map<string, { totalScore: number; count: number; variants: Set<string> }>();

    nonIdealModels.forEach(modelId => {
      const coverageResult = promptCoverageScores[modelId];
      const coverageScore = (coverageResult && !('error' in coverageResult) && typeof coverageResult.avgCoverageExtent === 'number' && !isNaN(coverageResult.avgCoverageExtent))
        ? coverageResult.avgCoverageExtent
        : null;

      if (coverageScore !== null) {
        // Parse to get canonical model name
        const { baseId } = parseEffectiveModelId(modelId);
        
        if (!canonicalModelScores.has(baseId)) {
          canonicalModelScores.set(baseId, { totalScore: 0, count: 0, variants: new Set() });
        }
        
        const current = canonicalModelScores.get(baseId)!;
        current.totalScore += coverageScore;
        current.count++;
        current.variants.add(modelId);
        canonicalModelScores.set(baseId, current);
      }
    });

    // Convert to array format for ranking
    const modelScores: { modelId: string; coverageScore: number | null }[] = [];
    canonicalModelScores.forEach((data, baseId) => {
      if (data.count > 0) {
        const avgScore = data.totalScore / data.count;
        modelScores.push({ modelId: baseId, coverageScore: avgScore });
      }
    });

    // Find best and worst performers based on coverage scores only
    const validCoverageScores = modelScores.filter(m => m.coverageScore !== null);
    let bestPerformer: { modelId: string; score: number } | null = null;
    let worstPerformer: { modelId: string; score: number } | null = null;

    if (validCoverageScores.length > 0) {
      const sortedByCoverage = [...validCoverageScores].sort((a, b) => b.coverageScore! - a.coverageScore!);
      bestPerformer = { modelId: sortedByCoverage[0].modelId, score: sortedByCoverage[0].coverageScore! };
      worstPerformer = { modelId: sortedByCoverage[sortedByCoverage.length - 1].modelId, score: sortedByCoverage[sortedByCoverage.length - 1].coverageScore! };
    }

    // Calculate standard deviation of coverage scores for this prompt
    const coverageScores = validCoverageScores.map(m => m.coverageScore!);
    let scoreStdDev: number | null = null;
    if (coverageScores.length >= 2) {
      const mean = coverageScores.reduce((sum, score) => sum + score, 0) / coverageScores.length;
      const variance = coverageScores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / coverageScores.length;
      scoreStdDev = Math.sqrt(variance);
    }

    return {
      bestPerformer,
      worstPerformer,
      scoreStdDev,
      totalModels: nonIdealModels.length,
      validModels: validCoverageScores.length
    };
  }, [data, currentPromptId, displayedModels]);

  if (!promptStats) return null;

  const { bestPerformer, worstPerformer, scoreStdDev, totalModels, validModels } = promptStats;

  const rows: Array<{
    label: React.ReactNode;
    item: React.ReactNode;
    value: string;
    tooltip: string;
  }> = [];

  if (bestPerformer) {
    rows.push({
      label: (
        <span className="flex items-center gap-1.5">
          🏆 Best for this prompt
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild><Icon name="info" className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
              <TooltipContent><p>Based on Key Point Coverage for this specific prompt.</p></TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </span>
      ),
      item: <span className="underline cursor-pointer" onClick={() => openModelPerformanceModal(bestPerformer.modelId)}>{getModelDisplayLabel(bestPerformer.modelId, { hideProvider: true })}</span>,
      value: `${(bestPerformer.score * 100).toFixed(1)}%`,
      tooltip: `Best performing model for this prompt: ${getModelDisplayLabel(bestPerformer.modelId)}`
    });
  }

  if (worstPerformer && bestPerformer && worstPerformer.modelId !== bestPerformer.modelId) {
    rows.push({
      label: '📉 Worst for this prompt',
      item: <span className="underline cursor-pointer" onClick={() => openModelPerformanceModal(worstPerformer.modelId)}>{getModelDisplayLabel(worstPerformer.modelId, { hideProvider: true })}</span>,
      value: `${(worstPerformer.score * 100).toFixed(1)}%`,
      tooltip: `Worst performing model for this prompt: ${getModelDisplayLabel(worstPerformer.modelId)}`
    });
  }

  if (scoreStdDev !== null) {
    rows.push({
      label: '📊 Score Spread',
      item: `${validModels} of ${totalModels} models`,
      value: `σ = ${scoreStdDev.toFixed(3)}`,
      tooltip: `Standard deviation of scores shows how much models disagree on this prompt`
    });
  }

  return (
    <div className="mb-2">
      {/* Mobile: Card-based layout */}
      <div className="block sm:hidden space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="bg-card/50 dark:bg-slate-800/30 rounded-lg p-3 border border-border/50">
            <div className="flex flex-col space-y-2">
              <div className="text-sm font-medium text-muted-foreground">{row.label}</div>
              <div className="text-foreground font-medium">{row.item}</div>
              <div className="text-right font-semibold text-foreground text-sm">{row.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-border/30 last:border-b-0">
                <td className="py-1.5 pr-2 font-medium text-muted-foreground whitespace-nowrap">{row.label}</td>
                <td className="py-1.5 px-2 text-foreground truncate max-w-[200px]" title={row.tooltip}>{row.item}</td>
                <td className="py-1.5 pl-2 text-right font-semibold text-foreground whitespace-nowrap">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AnalysisPageHeader: React.FC<AnalysisPageHeaderProps> = ({
  actions,
  headerWidget,
  children,
  isSticky = false,
}) => {
  // Preload icons used in this header component
  // usePreloadIcons(['trophy', 'info', 'message-square', 'sparkles']);
  // usePreloadMarkdown();

  const {
    data,
    pageTitle,
    breadcrumbItems,
    isSandbox,
    normalizedExecutiveSummary,
    currentPromptId,
    summaryStats,
  } = useUnifiedAnalysis();

  if (!data) return null;

  const { configTitle, description, tags } = data.config;
  const hasDescription = description && description.trim() !== '';
  
  // Combine manual tags and auto tags for unified display
  const unifiedTags = useMemo(() => {
    const manualTags = tags || [];
    const autoTags = data.executiveSummary?.structured?.autoTags || [];
    
    // Combine and deduplicate tags (case-insensitive)
    const allTags = [...manualTags, ...autoTags];
    const uniqueTags = allTags.filter((tag, index, arr) => 
      arr.findIndex(t => t.toLowerCase() === tag.toLowerCase()) === index
    );
    
    return uniqueTags;
  }, [tags, data.executiveSummary?.structured?.autoTags]);

  // Get prompt-specific data when in single prompt view
  const promptData = useMemo(() => {
    if (!currentPromptId || !data.promptContexts) return null;
    
    const promptContext = data.promptContexts[currentPromptId];
    const promptConfig = data.config.prompts?.find(p => p.id === currentPromptId);
    
    return {
      promptContext,
      promptDescription: promptConfig?.description,
      promptCitation: promptConfig?.citation
    };
  }, [currentPromptId, data.promptContexts, data.config.prompts]);

  const isInSinglePromptView = !!currentPromptId;

  return (
    <header
      className={`bg-card/60 dark:bg-slate-800/50 backdrop-blur-md p-4 sm:p-5 rounded-xl shadow-lg ring-1 ring-border dark:ring-slate-700/60 relative ${
        isSticky ? 'sticky top-4 z-40' : ''
      }`}
    >
      {!isSandbox && breadcrumbItems && breadcrumbItems.length > 0 && (
        <div className="mb-3 px-1 sm:px-0">
          <Breadcrumbs items={breadcrumbItems} className="text-xs sm:text-sm" />
        </div>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start gap-x-8 gap-y-4">
        <div className={cn(
          "w-full",
          !isInSinglePromptView && normalizedExecutiveSummary && "lg:w-[50%] lg:flex-shrink-0"
        )}>
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
            <h1
              className="text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl"
              title={pageTitle}
            >
              {pageTitle}
            </h1>
            {headerWidget}
          </div>

          {/* Prompt-specific content for single prompt view */}
          {isInSinglePromptView && promptData && (
            <div className="mt-4 space-y-4">
              {promptData.promptDescription && (
                <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground border-l-4 border-primary/20 pl-4 py-1">
                  <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                    {promptData.promptDescription}
                  </ReactMarkdown>
                </div>
              )}
              
              {promptData.promptCitation && (
                <div className="flex items-start space-x-1.5 text-xs text-muted-foreground/90 italic border-l-2 border-border pl-3 py-2">
                  <span>Source: {promptData.promptCitation}</span>
                </div>
              )}
              
              <div className="bg-muted/50 dark:bg-slate-900/40 p-4 rounded-lg">
                <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center">
                  <Icon name="message-square" className="w-4 h-4 mr-2 text-primary" />
                  Prompt Content
                </h3>
                <PromptContextDisplay promptContext={promptData.promptContext} />
              </div>
            </div>
          )}

          {/* General description and config info for both views */}
          {!isInSinglePromptView && hasDescription && (
            <div className="mt-3 text-sm text-foreground prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                {description!}
              </ReactMarkdown>
            </div>
          )}

          {configTitle && pageTitle && !pageTitle.includes(configTitle) && (
             <p className="text-sm text-muted-foreground mt-1">
               Blueprint: <span className="font-medium text-foreground">{configTitle}</span>
             </p>
          )}

          {unifiedTags && unifiedTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3 border-t border-border/60 mt-4 pt-4">
              <span className="text-xs font-semibold text-muted-foreground">TAGS:</span>
              {unifiedTags.map(tag => (
                <Link href={`/tags/${normalizeTag(tag)}`} key={tag}>
                  <Badge variant="secondary" className="hover:bg-primary/20 transition-colors">{prettifyTag(tag)}</Badge>
                </Link>
              ))}
            </div>
          )}

          {(isInSinglePromptView || summaryStats) && (
            <div className="mt-4 pt-4 border-t border-border/60">
              {isInSinglePromptView ? (
                <>
                  <h3 className="text-base font-semibold text-foreground mb-2 flex items-center">
                    <Icon name="sparkles" className="w-4 h-4 mr-2 text-primary" />
                    Stats for this prompt
                    {((data?.config?.systems && data.config.systems.length > 1) || 
                      (data?.config?.temperatures && data.config.temperatures.length > 1)) && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm font-normal text-muted-foreground ml-2 cursor-help">
                              (averaged across variations)
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              Scores are averaged across {
                                (data?.config?.systems && data.config.systems.length > 1) && 
                                (data?.config?.temperatures && data.config.temperatures.length > 1)
                                  ? `${data?.config?.systems?.length || 0} system prompts and ${data?.config?.temperatures?.length || 0} temperatures`
                                  : (data?.config?.systems && data.config.systems.length > 1)
                                    ? `${data?.config?.systems?.length || 0} system prompt variations`
                                    : `${data?.config?.temperatures?.length || 0} temperature variations`
                              } for each model.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </h3>
                  <PromptSpecificStatsTable />
                </>
              ) : (
                <SummaryStatsTable />)}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
            {actions && <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">{actions}</div>}
          </div>
        </div>

        {/* Executive summary only shown in aggregate view */}
        {!isInSinglePromptView && normalizedExecutiveSummary && (
          <div
            className="w-full lg:flex-1 bg-muted/50 dark:bg-slate-900/40 pb-4 px-4 rounded-lg flex flex-col"
          >
            <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
              {data.executiveSummary?.isStructured && data.executiveSummary?.structured ? (
                <StructuredSummary insights={data.executiveSummary.structured} />
              ) : (
                <MarkdownAccordion content={normalizedExecutiveSummary} />
              )}
            </div>
          </div>
        )}
      </div>
      
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
};

export default AnalysisPageHeader; 