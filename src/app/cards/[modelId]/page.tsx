import { notFound } from 'next/navigation';
import { getModelCard } from '@/lib/storageService';
import { ModelSummary } from '@/cli/types/model_card_types';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const Trophy = dynamic(() => import('lucide-react').then(mod => mod.Trophy), { ssr: true });
const Target = dynamic(() => import('lucide-react').then(mod => mod.Target), { ssr: true });
const TrendingUp = dynamic(() => import('lucide-react').then(mod => mod.TrendingUp), { ssr: true });
const AlertTriangle = dynamic(() => import('lucide-react').then(mod => mod.AlertTriangle), { ssr: true });
const Brain = dynamic(() => import('lucide-react').then(mod => mod.Brain), { ssr: true });
const CheckCircle = dynamic(() => import('lucide-react').then(mod => mod.CheckCircle), { ssr: true });
const XCircle = dynamic(() => import('lucide-react').then(mod => mod.XCircle), { ssr: true });
const Activity = dynamic(() => import('lucide-react').then(mod => mod.Activity), { ssr: true });
const ArrowLeft = dynamic(() => import('lucide-react').then(mod => mod.ArrowLeft), { ssr: true });
const Users = dynamic(() => import('lucide-react').then(mod => mod.Users), { ssr: true });

interface ModelCardPageProps {
  params: Promise<{
    modelId: string;
  }>;
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

  // Get top performing tags (top 3 with scores >= 0.6)
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

  const getPerformanceIcon = (score?: number | null) => {
    if (!score) return Activity;
    if (score >= 0.7) return Trophy;
    if (score >= 0.5) return Target;
    return TrendingUp;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-8">
        
        {/* Header with back navigation */}
        <div className="mb-6">
          <Link 
            href="/cards" 
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Model Cards
          </Link>
        </div>

        {/* Main Card - Landscape Layout */}
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          
          {/* Header Section - Compact */}
          <div className="bg-muted/20 px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                  <Brain className="h-6 w-6 text-primary" />
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
                  {modelCard.overallStats.averageHybridScore ? `${(modelCard.overallStats.averageHybridScore * 100).toFixed(1)}%` : 'N/A'}
                </div>
                <div className="text-xs text-muted-foreground">Overall Score</div>
              </div>
            </div>
          </div>

          {/* Main Content - Two Column Layout */}
          <div className="flex flex-col lg:flex-row">
            
            {/* Left Column - Key Insights (Primary Focus) */}
            <div className="flex-1 p-6 lg:pr-4">
              <div className="flex items-center mb-6">
                <Brain className="h-5 w-5 text-primary mr-2" />
                <h2 className="text-lg font-semibold">Key Insights</h2>
              </div>
              
              {modelCard.analyticalSummary ? (
                <div className="space-y-6">
                  {/* Strengths */}
                  {modelCard.analyticalSummary.strengths?.length > 0 && (
                    <div>
                      <div className="flex items-center mb-3">
                        <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                        <h3 className="font-semibold text-green-600 dark:text-green-400">Strengths</h3>
                      </div>
                      <ul className="space-y-2">
                        {modelCard.analyticalSummary.strengths.slice(0, 3).map((strength, i) => (
                          <li key={i} className="text-sm text-foreground pl-3 border-l-2 border-green-500/30 leading-relaxed">
                            {strength}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Weaknesses */}
                  {modelCard.analyticalSummary.weaknesses?.length > 0 && (
                    <div>
                      <div className="flex items-center mb-3">
                        <XCircle className="h-4 w-4 text-orange-600 mr-2" />
                        <h3 className="font-semibold text-orange-600 dark:text-orange-400">Areas for Improvement</h3>
                      </div>
                      <ul className="space-y-2">
                        {modelCard.analyticalSummary.weaknesses.slice(0, 3).map((weakness, i) => (
                          <li key={i} className="text-sm text-foreground pl-3 border-l-2 border-orange-500/30 leading-relaxed">
                            {weakness}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Patterns */}
                  {modelCard.analyticalSummary.patterns?.length > 0 && (
                    <div>
                      <div className="flex items-center mb-3">
                        <Activity className="h-4 w-4 text-blue-600 mr-2" />
                        <h3 className="font-semibold text-blue-600 dark:text-blue-400">Behavioral Patterns</h3>
                      </div>
                      <ul className="space-y-2">
                        {modelCard.analyticalSummary.patterns.slice(0, 2).map((pattern, i) => (
                          <li key={i} className="text-sm text-foreground pl-3 border-l-2 border-blue-500/30 leading-relaxed">
                            {pattern}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Risks */}
                  {modelCard.analyticalSummary.risks?.length > 0 && (
                    <div>
                      <div className="flex items-center mb-3">
                        <AlertTriangle className="h-4 w-4 text-red-600 mr-2" />
                        <h3 className="font-semibold text-red-600 dark:text-red-400">Key Risks</h3>
                      </div>
                      <ul className="space-y-2">
                        {modelCard.analyticalSummary.risks.slice(0, 2).map((risk, i) => (
                          <li key={i} className="text-sm text-foreground pl-3 border-l-2 border-red-500/30 leading-relaxed">
                            {risk}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No analytical insights available yet.</p>
                </div>
              )}
            </div>

            {/* Right Column - Stats & Metadata (Secondary) */}
            <div className="lg:w-80 bg-muted/10 border-t lg:border-t-0 lg:border-l border-border p-6">
              
              {/* Quick Stats */}
              <div className="mb-6">
                <h3 className="font-medium text-sm text-muted-foreground mb-3">Performance Summary</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Activity className="h-3.5 w-3.5 text-muted-foreground mr-2" />
                      <span className="text-sm">Evaluations</span>
                    </div>
                    <span className="font-medium">{modelCard.overallStats.totalRuns}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <Users className="h-3.5 w-3.5 text-muted-foreground mr-2" />
                      <span className="text-sm">Blueprints</span>
                    </div>
                    <span className="font-medium">{modelCard.overallStats.totalBlueprints}</span>
                  </div>
                </div>
              </div>

              {/* Top Performance Areas */}
              {topPerformingTags.length > 0 && (
                <>
                  <Separator className="my-4" />
                  <div className="mb-6">
                    <h3 className="font-medium text-sm text-muted-foreground mb-3">Top Performance</h3>
                    <div className="space-y-2">
                      {topPerformingTags.map(([tag, data]) => {
                        const IconComponent = getPerformanceIcon(data.averageScore);
                        return (
                          <div key={tag} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <IconComponent className={`h-3.5 w-3.5 ${getPerformanceColor(data.averageScore)}`} />
                              <span className="text-sm capitalize">{tag.replace(/-/g, ' ')}</span>
                            </div>
                            <Badge variant="outline" className={`text-xs ${getPerformanceColor(data.averageScore)} border-current`}>
                              {data.averageScore ? `${(data.averageScore * 100).toFixed(1)}%` : 'N/A'}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
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
              <div className="text-center">
                <div className="text-xs text-muted-foreground">
                  Updated {new Date(modelCard.lastUpdated).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 