import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getModelCard } from '@/lib/storageService';
import { ModelSummary } from '@/cli/types/model_card_types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import Icon, { type IconName } from '@/components/ui/icon';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import RemarkGfmPlugin from 'remark-gfm';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';

// Shared formatters
const formatPercent = (value?: number | null, fractionDigits = 1): string => {
  if (value === null || value === undefined) return 'N/A';
  return `${(value * 100).toFixed(fractionDigits)}%`;
};

const formatDimScore10 = (value?: number | null, fractionDigits = 1): string => {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(fractionDigits)}/10`;
};

interface ModelCardPageProps {
  params: Promise<{
    modelId: string;
  }>;
}

export async function generateMetadata({ params }: ModelCardPageProps): Promise<Metadata> {
  const { modelId } = await params;
  const decodedModelId = decodeURIComponent(modelId);
  
  try {
    const modelCard = await getModelCard(decodedModelId);
    
    if (!modelCard) {
      return {
        title: 'Model Card Not Found',
        description: 'The requested model card could not be found.',
      };
    }

    const overallScore = formatPercent(modelCard.overallStats.averageHybridScore);

    const description = modelCard.analyticalSummary?.tldr
      ? modelCard.analyticalSummary.tldr
      : modelCard.analyticalSummary?.strengths?.[0] 
      ? `${modelCard.analyticalSummary.strengths[0].substring(0, 150)}...`
      : `Model card for ${modelCard.displayName} with ${modelCard.overallStats.totalRuns} runs across ${modelCard.overallStats.totalBlueprints} blueprints.`;

    return {
      title: `${modelCard.displayName.toUpperCase()} Model Card - ${overallScore} Overall Score`,
      description: description,
      openGraph: {
        title: `${modelCard.displayName} Model Card`,
        description: description,
        type: 'website',
      },
      twitter: {
        card: 'summary',
        title: `${modelCard.displayName} Model Card`,
        description: description,
      },
    };
  } catch (error) {
    console.error('Error generating metadata for model card:', error);
    return {
      title: `${decodedModelId} Model Card`,
      description: `Model evaluation card for ${decodedModelId}`,
    };
  }
}

export default async function ModelCardPage({ params }: ModelCardPageProps) {
  const { modelId } = await params;
  
  // Decode the model ID in case it was URL-encoded
  const decodedModelId = decodeURIComponent(modelId);
  
  let modelCard: ModelSummary;
  try {
    modelCard = await getModelCard(decodedModelId);
    if (!modelCard) {
      notFound();
    }
  } catch (error) {
    console.error('Error fetching model card:', error);
    notFound();
  }

  // Get top performing dimensions (top 4 with scores >= 6.0/10)
  const topPerformingDimensions = modelCard.dimensionalGrades 
    ? Object.entries(modelCard.dimensionalGrades)
        .filter(([, data]) => data.averageScore >= 6.0)
        .sort(([,a], [,b]) => b.averageScore - a.averageScore)
        .slice(0, 4)
    : [];

  // Fallback to tag performance if no dimensional grades available
  const topPerformingTags = modelCard.performanceByTag 
    ? Object.entries(modelCard.performanceByTag)
        .filter(([, data]) => data.averageScore && data.averageScore >= 0.6)
        .sort(([,a], [,b]) => (b.averageScore || 0) - (a.averageScore || 0))
        .slice(0, 3)
    : [];

  const getPerformanceColor = (score?: number | null) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 0.7) return 'text-green-600 dark:text-green-400';
    if (score >= 0.5) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-orange-600 dark:text-orange-400';
  };

  const getDimensionalColor = (score?: number | null) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 8) return 'text-green-600 dark:text-green-400';
    if (score >= 6) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 4) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getDimensionalIcon = (dimensionKey: string): IconName => {
    // Map dimension keys to appropriate available icons
    const iconMap: Record<string, IconName> = {
      'adherence': 'check-circle',
      'clarity': 'eye',
      'tone': 'wand-2',        // Volume not available, use wand for tone/style
      'depth': 'layers',
      'coherence': 'git-merge', // Flow not available, use merge for coherence
      'helpfulness': 'award',   // Hand-helping not available, use award
      'credibility': 'shield',
      'empathy': 'users',       // Heart not available, use users for empathy
      'creativity': 'sparkles', // Lightbulb not available, use sparkles
      'safety': 'shield',
      'argumentation': 'message-square',
      'efficiency': 'trending-up', // Clock not available, use trending-up for efficiency  
      'humility': 'users'
    };
    return iconMap[dimensionKey] || 'activity';
  };

  const getTagIconName = (tag: string): IconName => {
    const iconMap: Record<string, IconName> = {
      safety: 'shield',
      reasoning: 'brain',
      code: 'file-code-2',
    };
    return iconMap[tag] || 'activity';
  };

  // duplicate-safe: helper functions defined once at top of file

  return (
    <div>
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Main Card - Landscape Layout */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          
          {/* Header Section - Compact */}
          <div className="bg-muted/20 px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Icon name="brain" className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">MODEL CARD: {modelCard.displayName.toUpperCase()}</h1>
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <Badge variant="outline" className="font-normal text-xs">
                      {modelCard.provider}
                    </Badge>
                    <span>•</span>
                    <span>{modelCard.modelId}</span>
                  </div>
                </div>
              </div>
              
              {/* Quick Score Display */}
              <div className="text-right">
                <div className="text-2xl font-bold text-primary">
                  {formatPercent(modelCard.overallStats.averageHybridScore)}
                </div>
                <div className="text-xs text-muted-foreground">Overall Score</div>
              </div>
            </div>
          </div>

          {/* Main Content - Two Column Layout */}
          <div className="flex flex-col lg:flex-row">
            
            {/* Left Column - Key Insights (Primary Focus) */}
            <div className="flex-1 p-6 lg:pr-4">
              
              {modelCard.analyticalSummary ? (
                <div className="space-y-6">
                  {/* TL;DR Overview */}
                  {modelCard.analyticalSummary.tldr && (
                    <div>
                      <div className="flex items-center mb-3">
                        <Icon name="info" className="h-4 w-4 text-primary mr-2" />
                        <h3 className="font-semibold text-primary">TL;DR</h3>
                      </div>
                      <p className="text-sm text-foreground leading-relaxed">
                        {modelCard.analyticalSummary.tldr}
                      </p>
                    </div>
                  )}
                  {/* Strengths */}
                  {modelCard.analyticalSummary.strengths?.length > 0 && (
                    <div>
                      <div className="flex items-center mb-3">
                        <Icon name="check-circle" className="h-4 w-4 text-green-600 mr-2" />
                        <h3 className="font-semibold text-green-600 dark:text-green-400">Strengths</h3>
                      </div>
                      <ul className="space-y-2">
                        {modelCard.analyticalSummary.strengths.slice(0, 3).map((strength, i) => (
                          <li key={i} className="text-sm text-foreground pl-3 border-l-2 border-green-500/30 leading-relaxed prose prose-sm max-w-none">
                            <ResponseRenderer content={strength} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Weaknesses */}
                  {modelCard.analyticalSummary.weaknesses?.length > 0 && (
                    <div>
                      <div className="flex items-center mb-3">
                        <Icon name="x-circle" className="h-4 w-4 text-orange-600 mr-2" />
                        <h3 className="font-semibold text-orange-600 dark:text-orange-400">Areas for Improvement</h3>
                      </div>
                      <ul className="space-y-2">
                        {modelCard.analyticalSummary.weaknesses.slice(0, 3).map((weakness, i) => (
                          <li key={i} className="text-sm text-foreground pl-3 border-l-2 border-orange-500/30 leading-relaxed prose prose-sm max-w-none">
                            <ResponseRenderer content={weakness} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Patterns */}
                  {modelCard.analyticalSummary.patterns?.length > 0 && (
                    <div>
                      <div className="flex items-center mb-3">
                        <Icon name="activity" className="h-4 w-4 text-blue-600 mr-2" />
                        <h3 className="font-semibold text-blue-600 dark:text-blue-400">Behavioral Patterns</h3>
                      </div>
                      <ul className="space-y-2">
                        {modelCard.analyticalSummary.patterns.slice(0, 2).map((pattern, i) => (
                          <li key={i} className="text-sm text-foreground pl-3 border-l-2 border-blue-500/30 leading-relaxed prose prose-sm max-w-none">
                            <ResponseRenderer content={pattern} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Risks */}
                  {modelCard.analyticalSummary.risks?.length > 0 && (
                    <div>
                      <div className="flex items-center mb-3">
                        <Icon name="alert-triangle" className="h-4 w-4 text-red-600 mr-2" />
                        <h3 className="font-semibold text-red-600 dark:text-red-400">Key Risks</h3>
                      </div>
                      <ul className="space-y-2">
                        {modelCard.analyticalSummary.risks.slice(0, 2).map((risk, i) => (
                          <li key={i} className="text-sm text-foreground pl-3 border-l-2 border-red-500/30 leading-relaxed prose prose-sm max-w-none">
                            <ResponseRenderer content={risk} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Icon name="brain" className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No analytical insights available yet.</p>
                </div>
              )}
            </div>

            {/* Right Column - Stats & Metadata (Secondary) */}
            <div className="lg:w-80 bg-muted/10 border-t lg:border-t-0 lg:border-l border-border p-6 lg:sticky lg:top-4 self-start">
              <TooltipProvider>
              
              {/* Quick Stats */}
              <div className="mb-6">
                <h3 className="font-medium text-sm text-muted-foreground mb-3">Performance Summary</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                        <Icon name="activity" className="h-3.5 w-3.5 text-muted-foreground mr-2" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm cursor-help">Runs</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Number of times this model was evaluated across all blueprints
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="font-medium">{modelCard.overallStats.totalRuns}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Icon name="users" className="h-3.5 w-3.5 text-muted-foreground mr-2" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm cursor-help">Blueprints</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Distinct evaluation blueprints/configs this model was tested on
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="font-medium">{modelCard.overallStats.totalBlueprints}</span>
                  </div>
                </div>
              </div>

              {/* Top Dimensional Performance */}
              {topPerformingDimensions.length > 0 ? (
                <>
                  <Separator className="my-4" />
                  <div className="mb-6">
                    <h3 className="font-medium text-sm text-muted-foreground mb-3">Top Dimensional Strengths</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Highest rated capabilities across {topPerformingDimensions.length} dimensions
                    </p>
                    <div className="space-y-2">
                      {topPerformingDimensions.map(([dimensionKey, data]) => {
                        return (
                          <div key={dimensionKey} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Icon name={getDimensionalIcon(dimensionKey)} className={`h-3.5 w-3.5 ${getDimensionalColor(data.averageScore)}`} />
                              <span className="text-sm">{data.label}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Badge variant="outline" className={`text-xs ${getDimensionalColor(data.averageScore)} border-current`}>
                                {formatDimScore10(data.averageScore)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                ({data.evaluationCount})
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : topPerformingTags.length > 0 ? (
                <>
                  <Separator className="my-4" />
                  <div className="mb-6">
                    <h3 className="font-medium text-sm text-muted-foreground mb-3">Top Performance Areas</h3>
                    <div className="space-y-2">
                      {topPerformingTags.map(([tag, data]) => {
                        return (
                          <div key={tag} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <Icon name={getTagIconName(tag)} className={`h-3.5 w-3.5 ${getPerformanceColor(data.averageScore)}`} />
                              <span className="text-sm capitalize">{tag.replace(/-/g, ' ')}</span>
                            </div>
                            <Badge variant="outline" className={`text-xs ${getPerformanceColor(data.averageScore)} border-current`}>
                              {formatPercent(data.averageScore)}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}

              {/* Top Performing Evaluations */}
              {modelCard.topPerformingEvaluations && modelCard.topPerformingEvaluations.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div className="mb-6">
                    <h3 className="font-medium text-sm text-muted-foreground mb-3">Top Evaluations</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Best performances across {modelCard.topPerformingEvaluations.length} evaluations
                    </p>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {modelCard.topPerformingEvaluations.slice(0, 5).map((evaluation, i) => (
                        <Link
                          key={i}
                          href={evaluation.analysisUrl}
                          className="block p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors text-xs"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-foreground truncate pr-2">
                              {evaluation.configTitle}
                            </span>
                            <div className="flex items-center space-x-1 flex-shrink-0">
                              {evaluation.rank && (
                                <Badge variant="outline" className="text-xs px-1 py-0">
                                  #{evaluation.rank}
                                </Badge>
                              )}
                              <Badge 
                                variant="outline" 
                                className={`text-xs px-1 py-0 ${getPerformanceColor(evaluation.hybridScore)} border-current`}
                              >
                                {formatPercent(evaluation.hybridScore)}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span className="text-xs">
                              vs {evaluation.totalModelsInRun} models
                            </span>
                            {evaluation.relativePeerAdvantage !== null && evaluation.relativePeerAdvantage > 0 && (
                              <span className="text-xs text-green-600 dark:text-green-400">
                                +{(evaluation.relativePeerAdvantage * 100).toFixed(1)}% vs peers
                              </span>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                    {modelCard.topPerformingEvaluations.length > 5 && (
                      <p className="text-xs text-muted-foreground mt-2 text-center">
                        +{modelCard.topPerformingEvaluations.length - 5} more evaluations
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* Model Variants */}
              {modelCard.discoveredModelIds && modelCard.discoveredModelIds.length > 1 && (
                <>
                  <Separator className="my-4" />
                  <div className="mb-6">
                    <h3 className="font-medium text-sm text-muted-foreground mb-3">Model Variants</h3>
                    <p className="text-xs text-muted-foreground mb-2">
                      {modelCard.discoveredModelIds.length} tested variants
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        const uniqueBaseModels = [...new Set(
                          modelCard.discoveredModelIds.map(variant => variant.split('[')[0])
                        )];
                        
                        return (
                          <>
                            {uniqueBaseModels.slice(0, 2).map((baseModel, i) => (
                              <Badge key={i} variant="secondary" className="text-xs font-mono">
                                {baseModel.split('/').pop()}
                              </Badge>
                            ))}
                            {uniqueBaseModels.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{uniqueBaseModels.length - 2}
                              </Badge>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </>
              )}

              {/* Footer */}
              <Separator className="my-4" />

              {/* Worst Performing Evaluations (from NDeltas) */}
              {modelCard.worstPerformingEvaluations && modelCard.worstPerformingEvaluations.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-medium text-sm text-muted-foreground mb-3">Worst Evaluations</h3>
                  <p className="text-xs text-muted-foreground mb-3">Prompts where this model underperformed peers the most (most negative delta).</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {modelCard.worstPerformingEvaluations.map((w, i) => (
                      <Link key={i} href={w.analysisUrl} className="block p-2 rounded-md bg-muted/30 hover:bg-muted/50 transition-colors text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-foreground truncate pr-2">{w.configTitle}</span>
                          <span className="font-mono text-red-600 dark:text-red-400">Δ {w.delta.toFixed(3)}</span>
                        </div>
                        <div className="flex items-center justify-between text-muted-foreground">
                          <span className="text-xs">prompt: {w.promptId}</span>
                          <span className="text-xs">model {w.modelCoverage.toFixed(2)} vs peers {w.peerAverageCoverage.toFixed(2)}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-center">
                <div className="text-xs text-muted-foreground">Updated {new Date(modelCard.lastUpdated).toLocaleDateString()}</div>
              </div>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 