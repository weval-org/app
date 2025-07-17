'use client';

import { useState, useEffect } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { StructuredInsights, ModelGrades } from '@/types/shared';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import { GRADING_DIMENSIONS, getGradingDimension } from '@/lib/grading-criteria';
import dynamic from 'next/dynamic';

const ChevronRight = dynamic(() => import('lucide-react').then(mod => mod.ChevronRight), { ssr: false });
const Star = dynamic(() => import('lucide-react').then(mod => mod.Star), { ssr: false });
const TrendingUp = dynamic(() => import('lucide-react').then(mod => mod.TrendingUp), { ssr: false });
const TrendingDown = dynamic(() => import('lucide-react').then(mod => mod.TrendingDown), { ssr: false });
const Eye = dynamic(() => import('lucide-react').then(mod => mod.Eye), { ssr: false });
const Award = dynamic(() => import('lucide-react').then(mod => mod.Award), { ssr: false });
const Info = dynamic(() => import('lucide-react').then(mod => mod.Info), { ssr: false });
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });
const RemarkGfmPlugin = dynamic(() => import('remark-gfm'), { ssr: false });

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

function cleanOutModelProviders(text: string): string {
  return text.replace(/(?:openrouter|openai|anthropic|together|xai|google):(?=[\w-.]+\/[\w-.]+)/ig, '');
}

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
  onShowInfo: (dimension: any) => void;
}> = ({ dimensionKey, label, onShowInfo }) => {
  const dimension = getGradingDimension(dimensionKey);
  
  if (!dimension) {
    return <span className="font-medium text-muted-foreground">{label}</span>;
  }

  return (
    <button 
      onClick={() => onShowInfo(dimension)}
      className="flex items-center space-x-2 hover:text-foreground transition-colors cursor-pointer min-w-0 w-full text-left py-1 px-1 rounded hover:bg-muted/50"
    >
      <Info className="w-3 h-3 text-muted-foreground/60 hover:text-muted-foreground flex-shrink-0" />
      <span className="font-medium text-muted-foreground truncate">{label}</span>
    </button>
  );
};

const ModelGradesDisplay: React.FC<{ grades: ModelGrades[] }> = ({ grades }) => {
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [selectedDimension, setSelectedDimension] = useState<any>(null);
  
  if (!grades.length) return null;

  // Calculate overall scores and sort models by performance
  const modelsWithOverallScore = grades.map(modelGrade => {
    const gradeValues = Object.values(modelGrade.grades);
    const overallScore = gradeValues.reduce((sum, score) => sum + score, 0) / gradeValues.length;
    
    // Find top 2 strengths and weaknesses
    const dimensionScores = Object.entries(modelGrade.grades).map(([dim, score]) => ({
      dimension: gradeLabels[dim as keyof typeof gradeLabels],
      score
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
                <div className="flex items-center space-x-3 flex-1">
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
                      {getModelDisplayLabel(modelData.modelId)}
                    </h4>
                  </div>
                  
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">Overall:</span>
                      <span className={`font-semibold text-lg ${getGradeColor(modelData.overallScore)}`}>
                        {modelData.overallScore.toFixed(1)}/10
                      </span>
                    </div>
                    
                    {/* Quick highlights */}
                    <div className="hidden sm:flex items-center space-x-4 text-xs">
                      {modelData.strengths.length > 0 && (
                        <div className="flex items-center space-x-1">
                          <TrendingUp className="w-3 h-3 text-green-600" />
                          <span className="text-muted-foreground">
                            {modelData.strengths[0].dimension}
                          </span>
                        </div>
                      )}
                      {modelData.weaknesses.length > 0 && (
                        <div className="flex items-center space-x-1">
                          <TrendingDown className="w-3 h-3 text-red-600" />
                          <span className="text-muted-foreground">
                            {modelData.weaknesses[0].dimension}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <ChevronRight className={`w-4 h-4 text-muted-foreground transform transition-transform ${
                  isExpanded ? 'rotate-90' : ''
                }`} />
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
                          <TrendingUp className="w-3 h-3 mr-1" />
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
                          <TrendingDown className="w-3 h-3 mr-1" />
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
                        const percentage = (score / 10) * 100;
                        
                        return (
                          <div key={key} className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <DimensionLabel 
                                dimensionKey={key} 
                                label={label} 
                                onShowInfo={setSelectedDimension}
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
      <Dialog open={!!selectedDimension} onOpenChange={(open) => !open && setSelectedDimension(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedDimension?.label}</DialogTitle>
            <DialogDescription>{selectedDimension?.description}</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <h4 className="font-medium mb-3">Scoring Guide:</h4>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <span className="font-medium text-green-600 min-w-[3rem]">8-10:</span>
                <span className="text-sm">{selectedDimension?.scoringGuidance?.excellent}</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="font-medium text-blue-600 min-w-[3rem]">4-7:</span>
                <span className="text-sm">{selectedDimension?.scoringGuidance?.fair}</span>
              </div>
              <div className="flex items-start space-x-3">
                <span className="font-medium text-red-600 min-w-[3rem]">1-3:</span>
                <span className="text-sm">{selectedDimension?.scoringGuidance?.poor}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const StructuredSummary: React.FC<StructuredSummaryProps> = ({ insights }) => {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());

  const sections: SummarySection[] = [
    {
      id: 'findings',
      title: 'Key Findings',
      icon: <Star className="w-4 h-4" />,
      items: insights.keyFindings,
      color: 'text-yellow-600 dark:text-yellow-400'
    },
    {
      id: 'strengths', 
      title: 'Model Strengths',
      icon: <TrendingUp className="w-4 h-4" />,
      items: insights.strengths,
      color: 'text-green-600 dark:text-green-400'
    },
    {
      id: 'weaknesses',
      title: 'Model Weaknesses', 
      icon: <TrendingDown className="w-4 h-4" />,
      items: insights.weaknesses,
      color: 'text-red-600 dark:text-red-400'
    },
    {
      id: 'patterns',
      title: 'Interesting Patterns',
      icon: <Eye className="w-4 h-4" />,
      items: insights.patterns,
      color: 'text-blue-600 dark:text-blue-400'
    }
  ];

  // Add grades section if available
  const validSections = sections.filter(section => section.items.length > 0);
  const hasGrades = insights.grades && insights.grades.length > 0;

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

  if (validSections.length === 0 && !hasGrades) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No structured insights available.
      </div>
    );
  }

  return (
    <div className="text-sm space-y-1">
      {validSections.map((section) => (
        <Collapsible 
          key={section.id} 
          open={openSections.has(section.id)} 
          onOpenChange={() => toggleSection(section.id)}
          className="border-t border-border/60 first:border-t-0"
        >
          <CollapsibleTrigger className="flex items-center w-full text-left py-3 group -mx-3 px-3 hover:bg-muted/50 rounded-md">
            <ChevronRight className={`w-4 h-4 mr-2 flex-shrink-0 transform transition-transform text-muted-foreground group-hover:text-primary ${openSections.has(section.id) ? 'rotate-90' : ''}`} />
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
              {section.items.map((item, index) => (
                <div 
                  key={index}
                  className="text-muted-foreground bg-muted/20 dark:bg-slate-800/20 rounded-md p-3 border-l-2 border-border prose prose-sm dark:prose-invert max-w-none"
                >
                  <ReactMarkdown remarkPlugins={[RemarkGfmPlugin as any]}>
                    {cleanOutModelProviders(item)}
                  </ReactMarkdown>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      ))}

      {hasGrades && (
        <Collapsible 
          open={openSections.has('grades')} 
          onOpenChange={() => toggleSection('grades')}
          className="border-t border-border/60"
        >
          <CollapsibleTrigger className="flex items-center w-full text-left py-3 group -mx-3 px-3 hover:bg-muted/50 rounded-md">
            <ChevronRight className={`w-4 h-4 mr-2 flex-shrink-0 transform transition-transform text-muted-foreground group-hover:text-primary ${openSections.has('grades') ? 'rotate-90' : ''}`} />
            <div className="mr-2 text-purple-600 dark:text-purple-400">
              <Award className="w-4 h-4" />
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
    </div>
  );
}; 