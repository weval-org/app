'use client';

import { useState, useEffect } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { StructuredInsights, ModelGrades } from '@/types/shared';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';
import dynamic from 'next/dynamic';

const ChevronRight = dynamic(() => import('lucide-react').then(mod => mod.ChevronRight));
const Star = dynamic(() => import('lucide-react').then(mod => mod.Star));
const TrendingUp = dynamic(() => import('lucide-react').then(mod => mod.TrendingUp));
const TrendingDown = dynamic(() => import('lucide-react').then(mod => mod.TrendingDown));
const Eye = dynamic(() => import('lucide-react').then(mod => mod.Eye));
const Award = dynamic(() => import('lucide-react').then(mod => mod.Award));
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

const gradeLabels = {
  adherence: 'Adherence',
  clarity: 'Clarity',
  tone: 'Tone',
  depth: 'Depth',
  coherence: 'Coherence',
  helpfulness: 'Helpfulness',
  credibility: 'Credibility',
  empathy: 'Empathy',
  creativity: 'Creativity',
  safety: 'Safety',
  argumentation: 'Argumentation',
  efficiency: 'Efficiency'
};

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

const ModelGradesDisplay: React.FC<{ grades: ModelGrades[] }> = ({ grades }) => {
  if (!grades.length) return null;

  return (
    <div className="space-y-6">
      {grades.map((modelGrade, index) => (
        <div key={index} className="bg-muted/30 dark:bg-slate-800/30 rounded-lg p-4">
          <h4 className="font-semibold text-foreground mb-4 flex items-center">
            <Award className="w-4 h-4 mr-2 text-primary" />
            {getModelDisplayLabel(modelGrade.modelId)}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(gradeLabels).map(([key, label]) => {
              const score = modelGrade.grades[key as keyof typeof modelGrade.grades];
              const percentage = (score / 10) * 100;
              
              return (
                <div key={key} className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium text-muted-foreground">{label}</span>
                    <span className={`font-semibold ${getGradeColor(score)}`}>
                      {score.toFixed(1)}/10
                    </span>
                  </div>
                  <Progress 
                    value={percentage} 
                    className="h-2"
                  />
                  <div className="text-xs text-muted-foreground">
                    {getGradeLabel(score)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
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
                  className="text-muted-foreground dark:text-slate-400 bg-muted/20 dark:bg-slate-800/20 rounded-md p-3 border-l-2 border-border prose prose-sm dark:prose-invert max-w-none"
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
              Model Grades
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