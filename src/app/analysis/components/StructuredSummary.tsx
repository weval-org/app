'use client';

import { useState, useEffect } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { StructuredInsights, ModelGrades } from '@/types/shared';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { GRADING_DIMENSIONS, getGradingDimension } from '@/lib/grading-criteria';

import { useAnalysis } from '@/app/analysis/context/AnalysisContext';
import Icon from '@/components/ui/icon';
import dynamic from 'next/dynamic';
import { usePreloadIcons } from '@/components/ui/use-preload-icons';
import ResponseRenderer from '@/app/components/ResponseRenderer';
import RemarkGfmPlugin from 'remark-gfm';
import { parseModelIdForDisplay } from '../../utils/modelIdUtils';

// Helper function to get base model ID (maker:model without variants)
function getBaseModelId(modelId: string): string {
  const parsed = parseModelIdForDisplay(modelId);
  return parsed.baseId;
}

// Helper function to find grades for a model, falling back to base model if needed
function findGradesForModel(modelId: string, grades: ModelGrades[]): ModelGrades | undefined {
  // First try exact match
  let grade = grades.find(g => g.modelId === modelId);
  
  // If no exact match, try base model match
  if (!grade) {
    const baseModelId = getBaseModelId(modelId);
    grade = grades.find(g => getBaseModelId(g.modelId) === baseModelId);
  }
  
  return grade;
}

function cleanOutModelProviders(text: string): string {
  // Don't clean providers from URLs (markdown links)
  // Only clean standalone provider references in text
  return text.replace(/(?<!#model-perf:)(?:openrouter|openai|anthropic|together|xai|google):(?=[\w-.]+\/[\w-.]+)/ig, '');
}

interface StructuredSummaryProps {
  insights: StructuredInsights;
}

interface SummarySection {
  id: string;
  title: string;
  icon: React.ReactNode;
  items: string[];
  color: string;
}

const gradeColors = {
  excellent: 'text-green-600 dark:text-green-400',
  good: 'text-blue-600 dark:text-blue-400', 
  fair: 'text-yellow-600 dark:text-yellow-400',
  poor: 'text-red-600 dark:text-red-400'
};

// Generate grade labels from centralized data
const gradeLabels = GRADING_DIMENSIONS.reduce((acc, dimension) => {
  acc[dimension.key] = dimension.label;
  return acc;
}, {} as Record<string, string>);

function getGradeColor(score: number): string {
  if (score >= 8) return gradeColors.excellent;
  if (score >= 6) return gradeColors.good;
  if (score >= 4) return gradeColors.fair;
  return gradeColors.poor;
}

function getGradeLabel(score: number): string {
  if (score >= 8) return 'Excellent';
  if (score >= 6) return 'Good'; 
  if (score >= 4) return 'Fair';
  return 'Poor';
}

const DimensionLabel: React.FC<{ 
  dimensionKey: string; 
  label: string;
}> = ({ dimensionKey, label }) => {
  const dimension = getGradingDimension(dimensionKey);
  
  if (!dimension) {
    return <span className="font-medium text-muted-foreground">{label}</span>;
  }

  return (
    <div className="flex items-center space-x-2 min-w-0 w-full">
      <Icon name="info" className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
      <span className="font-medium text-muted-foreground truncate">{label}</span>
    </div>
  );
};

const ModelGradesDisplay: React.FC<{ grades: ModelGrades[] }> = ({ grades }) => {
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [selectedDimensionInfo, setSelectedDimensionInfo] = useState<{
    dimension: any;
    modelId: string;
    score: number;
    reasoning?: string;
  } | null>(null);
  
  if (!grades.length) return null;

  // Calculate overall scores and sort models by performance
  const modelsWithOverallScore = grades.map(modelGrade => {
    const gradeValues = Object.values(modelGrade.grades).filter((score): score is number => score !== null);
    const overallScore = gradeValues.length > 0 ? gradeValues.reduce((sum, score) => sum + score, 0) / gradeValues.length : 0;
    
    // Find top 2 strengths and weaknesses
    const dimensionScores = Object.entries(modelGrade.grades)
      .filter(([_, score]) => score !== null)
      .map(([dim, score]) => ({
        dimension: gradeLabels[dim as keyof typeof gradeLabels],
        score: score as number
      }));
    
    const strengths = dimensionScores
      .filter(d => d.score >= 7)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
      
    const weaknesses = dimensionScores
      .filter(d => d.score < 6)
      .sort((a, b) => a.score - b.score)
      .slice(0, 2);

    return {
      ...modelGrade,
      overallScore,
      strengths,
      weaknesses
    };
  }).sort((a, b) => b.overallScore - a.overallScore);

  const toggleModel = (modelId: string) => {
    setExpandedModels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(modelId)) {
        newSet.delete(modelId);
      } else {
        newSet.add(modelId);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-3">
      {modelsWithOverallScore.map((modelData, index) => {
        const isExpanded = expandedModels.has(modelData.modelId);
        const rank = index + 1;
        
        return (
          <div key={modelData.modelId} className="bg-muted/30 dark:bg-slate-800/30 rounded-lg border border-border/50">
            {/* Summary Row */}
            <div 
              className="p-4 cursor-pointer hover:bg-muted/50 transition-colors rounded-lg"
              onClick={() => toggleModel(modelData.modelId)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <div className={`text-sm font-bold px-2 py-1 rounded ${
                      rank === 1 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                      rank === 2 ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-foreground' :
                      rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      #{rank}
                    </div>
                    <h4 className="font-semibold text-foreground m-0">
                      {getModelDisplayLabel(modelData.modelId, { prettifyModelName: true, hideProvider: true, hideModelMaker: true })}
                    </h4>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">Overall:</span>
                    <span className={`font-semibold text-lg ${getGradeColor(modelData.overallScore)}`}>
                      {modelData.overallScore.toFixed(1)}/10
                    </span>
                  </div>
                  
                  <Icon name="chevron-right" className={`w-4 h-4 text-muted-foreground transform transition-transform ${
                    isExpanded ? 'rotate-90' : ''
                  }`} />
                </div>
              </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-border/30">
                <div className="pt-4 space-y-4">
                  {/* Strengths & Weaknesses */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {modelData.strengths.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-green-600 dark:text-green-400 mb-2 flex items-center">
                          <Icon name="trending-up" className="w-3 h-3 mr-1" />
                          Top Strengths
                        </h5>
                        <div className="space-y-1">
                          {modelData.strengths.map((strength, i) => (
                            <div key={i} className="text-xs bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded">
                              <span className="font-medium">{strength.dimension}:</span> {strength.score.toFixed(1)}/10
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {modelData.weaknesses.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium text-red-600 dark:text-red-400 mb-2 flex items-center">
                          <Icon name="trending-down" className="w-3 h-3 mr-1" />
                          Areas for Improvement
                        </h5>
                        <div className="space-y-1">
                          {modelData.weaknesses.map((weakness, i) => (
                            <div key={i} className="text-xs bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                              <span className="font-medium">{weakness.dimension}:</span> {weakness.score.toFixed(1)}/10
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Full Grade Breakdown */}
                  <div>
                    <h5 className="text-sm font-medium text-muted-foreground mb-3">Complete Grade Breakdown</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(gradeLabels).map(([key, label]) => {
                        const score = modelData.grades[key as keyof typeof modelData.grades];
                        
                        // Skip dimensions that have null scores (not applicable)
                        if (score === null || score === undefined) {
                          return null;
                        }

                        const percentage = (score / 10) * 100;
                        
                        return (
                          <div 
                            key={key} 
                            className="space-y-1 p-2 rounded-md cursor-pointer hover:bg-muted/30 transition-colors"
                            onClick={() => {
                              const dimension = getGradingDimension(key);
                              if (dimension) {
                                setSelectedDimensionInfo({
                                  dimension,
                                  modelId: modelData.modelId,
                                  score,
                                  reasoning: modelData.reasoning?.[key as keyof typeof modelData.reasoning]
                                });
                              }
                            }}
                          >
                            <div className="flex justify-between items-center text-xs">
                              <DimensionLabel 
                                dimensionKey={key} 
                                label={label} 
                              />
                              <span className={`font-semibold ${getGradeColor(score)}`}>
                                {score.toFixed(1)}
                              </span>
                            </div>
                            <Progress value={percentage} className="h-1.5" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
      
      {/* Dimension Info Modal */}
      <Dialog open={!!selectedDimensionInfo} onOpenChange={(open) => !open && setSelectedDimensionInfo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedDimensionInfo?.dimension?.label}</DialogTitle>
            <DialogDescription>{selectedDimensionInfo?.dimension?.description}</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <h4 className="font-medium mb-3">Scoring Guide:</h4>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <span className="font-medium text-green-600 min-w-[3rem]">8-10:</span>
                <span className="text-sm">{selectedDimensionInfo?.dimension?.scoringGuidance?.excellent}</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="font-medium text-blue-600 min-w-[3rem]">4-7:</span>
                <span className="text-sm">{selectedDimensionInfo?.dimension?.scoringGuidance?.fair}</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="font-medium text-red-600 min-w-[3rem]">1-3:</span>
                <span className="text-sm">{selectedDimensionInfo?.dimension?.scoringGuidance?.poor}</span>
              </div>
            </div>
            
            {selectedDimensionInfo && (
              <>
                <div className="border-t border-border/50 my-4"></div>
                <h4 className="font-medium mb-3">Model Performance:</h4>
                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {getModelDisplayLabel(selectedDimensionInfo.modelId, { 
                        prettifyModelName: true, 
                        hideProvider: true, 
                        hideModelMaker: true 
                      })}
                    </span>
                    <span className={`font-semibold ${getGradeColor(selectedDimensionInfo.score)}`}>
                      {selectedDimensionInfo.score.toFixed(1)}/10
                    </span>
                  </div>
                  
                  {selectedDimensionInfo.reasoning && (
                    <div className="pt-2 border-t border-border/30">
                      <div className="text-xs font-medium text-muted-foreground mb-1">AI Evaluator's Reasoning:</div>
                      <div className="text-sm text-foreground italic bg-background/50 rounded p-2 border-l-2 border-primary/30">
                        "{selectedDimensionInfo.reasoning}"
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const StructuredSummary: React.FC<StructuredSummaryProps> = ({ insights }) => {
    const { data, openModelPerformanceModal, openPromptDetailModal } = useAnalysis();
    const [openSections, setOpenSections] = useState<Set<string>>(new Set());
    const [selectedSystemPrompt, setSelectedSystemPrompt] = useState<number | null>(null);

    const openSystemPromptModal = (systemIndex: number) => {
        setSelectedSystemPrompt(systemIndex);
    };

    // Preload icons used in this component
    usePreloadIcons([
        'info', 'trending-up', 'trending-down', 'chevron-right', 
        'star', 'eye', 'award'
    ]);

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A') {
      const anchor = target as HTMLAnchorElement;
      const href = anchor.getAttribute('href');
      if (href && href.startsWith('#model-perf:')) {
        e.preventDefault();
        const encodedModelId = href.substring('#model-perf:'.length);
        const modelId = decodeURIComponent(encodedModelId);
        openModelPerformanceModal(modelId);
      } else if (href && href.startsWith('#system-prompt:')) {
        e.preventDefault();
        const systemIndex = href.substring('#system-prompt:'.length);
        openSystemPromptModal(parseInt(systemIndex));
      } else if (href && href.startsWith('#prompt-detail:')) {
        e.preventDefault();
        const promptId = href.substring('#prompt-detail:'.length);
        openPromptDetailModal(promptId);
      }
    }
  };

  console.log('Debug Key Findings raw text', {
    keyFindings: insights.keyFindings,
  })

  const sections: SummarySection[] = [
    {
      id: 'findings',
      title: 'Key Findings',
      icon: <Icon name="star" className="w-4 h-4" />,
      items: insights.keyFindings,
      color: 'text-yellow-600 dark:text-yellow-400'
    },
    {
      id: 'strengths', 
      title: 'Model Strengths',
      icon: <Icon name="trending-up" className="w-4 h-4" />,
      items: insights.strengths,
      color: 'text-green-600 dark:text-green-400'
    },
    {
      id: 'weaknesses',
      title: 'Model Weaknesses', 
      icon: <Icon name="trending-down" className="w-4 h-4" />,
      items: insights.weaknesses,
      color: 'text-red-600 dark:text-red-400'
    },
    {
      id: 'patterns',
      title: 'Interesting Patterns',
      icon: <Icon name="eye" className="w-4 h-4" />,
      items: insights.patterns,
      color: 'text-blue-600 dark:text-blue-400'
    }
  ];

  // Add grades section if available
  const validSections = sections.filter(section => section.items.length > 0);
  const hasGrades = insights.grades && insights.grades.length > 0;
  const hasAutoTags = insights.autoTags && insights.autoTags.length > 0;

  // Set initial open state
  useEffect(() => {
    if (validSections.length > 0) {
      // Open first section by default
      const defaultOpen = new Set([validSections[0].id]);
      
      // Also open grades section if it exists and there are few other sections
      if (hasGrades && validSections.length <= 2) {
        defaultOpen.add('grades');
      }
      
      setOpenSections(defaultOpen);
    }
  }, [validSections.length, hasGrades]);

  const toggleSection = (sectionId: string) => {
    setOpenSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  if (validSections.length === 0 && !hasGrades && !hasAutoTags) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No structured insights available.
      </div>
    );
  }

  return (
    <div className="text-sm space-y-1" onClick={handleContentClick}>
      {validSections.map((section) => {
        const processedItems = section.items.map(item => {
          const cleaned = cleanOutModelProviders(item);
          // Executive summaries come pre-linkified from backend - no need for client-side linkification
          return cleaned;
        });

        if (processedItems.length === 0) return null;

        return (
          <Collapsible 
            key={section.id} 
            open={openSections.has(section.id)} 
            onOpenChange={() => toggleSection(section.id)}
            className="border-t border-border/60 first:border-t-0"
          >
            <CollapsibleTrigger className="flex items-center w-full text-left py-3 group -mx-3 px-3 hover:bg-muted/50 rounded-md">
              <Icon name="chevron-right" className={`w-4 h-4 mr-2 flex-shrink-0 transform transition-transform text-muted-foreground group-hover:text-primary ${openSections.has(section.id) ? 'rotate-90' : ''}`} />
              <div className={`mr-2 ${section.color}`}>
                {section.icon}
              </div>
              <span className="flex-1 font-semibold group-hover:text-primary text-base">
                {section.title}
              </span>
              <Badge variant="secondary" className="ml-2 text-xs">
                {section.items.length}
              </Badge>
            </CollapsibleTrigger>
            <CollapsibleContent className="pb-4 pt-1 pl-4">
              <div className="space-y-3">
                {processedItems.map((item, index) => (
                  <div 
                    key={index}
                    className="text-muted-foreground bg-muted/20 dark:bg-slate-800/20 rounded-md p-3 border-l-2 border-border prose prose-sm dark:prose-invert max-w-none"
                  >
                    <ResponseRenderer content={item} />
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {hasGrades && (
        <Collapsible 
          open={openSections.has('grades')} 
          onOpenChange={() => toggleSection('grades')}
          className="border-t border-border/60"
        >
          <CollapsibleTrigger className="flex items-center w-full text-left py-3 group -mx-3 px-3 hover:bg-muted/50 rounded-md">
            <Icon name="chevron-right" className={`w-4 h-4 mr-2 flex-shrink-0 transform transition-transform text-muted-foreground group-hover:text-primary ${openSections.has('grades') ? 'rotate-90' : ''}`} />
            <div className="mr-2 text-purple-600 dark:text-purple-400">
              <Icon name="award" className="w-4 h-4" />
            </div>
            <span className="flex-1 font-semibold group-hover:text-primary text-base">
              Qualitative Model Grades
            </span>
            <Badge variant="secondary" className="ml-2 text-xs">
              {insights.grades?.length || 0} models graded
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent className="pb-4 pt-1 pl-4">
            <ModelGradesDisplay grades={insights.grades || []} />
          </CollapsibleContent>
        </Collapsible>
      )}
      
      {/* System Prompt Modal */}
      <Dialog open={selectedSystemPrompt !== null} onOpenChange={(open) => !open && setSelectedSystemPrompt(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>System Prompt Variant {selectedSystemPrompt}</DialogTitle>
            <DialogDescription>
              The system prompt used for this evaluation variant
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 overflow-auto flex-1">
            {selectedSystemPrompt !== null && data?.config?.systems ? (
              data.config.systems[selectedSystemPrompt] ? (
                <pre className="text-sm bg-muted p-3 rounded whitespace-pre-wrap font-mono">
                  {data.config.systems[selectedSystemPrompt]}
                </pre>
              ) : (
                <div className="text-muted-foreground bg-muted/50 p-4 rounded border-2 border-dashed">
                  <p className="text-center">
                    <strong>No system prompt</strong>
                  </p>
                  <p className="text-sm text-center mt-2">
                    This variant uses the model's default behavior without any system prompt.
                  </p>
                </div>
              )
            ) : (
              <p className="text-muted-foreground">System prompt information not available.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}; 