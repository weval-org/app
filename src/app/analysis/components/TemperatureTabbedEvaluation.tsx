'use client';

import React, { useState } from 'react';
import { PointAssessment } from '@/app/utils/types';
import { EvaluationView } from '@/app/analysis/components/SharedEvaluationComponents';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface TempVariantBundle {
  temperature: number | null; // null for aggregate
  assessments: PointAssessment[];
  modelResponse: string;
  // Optional aggregated transcript of generated assistant turns for this variant/temp
  generatedTranscript?: string;
  // Optional structured history for nicer rendering
  generatedHistory?: any[];
}

interface TemperatureTabbedEvaluationProps {
  variants: TempVariantBundle[]; // first element should be aggregate
  idealResponse?: string;
  expandedLogs: Record<number, boolean>;
  toggleLogExpansion: (idx: number) => void;
  isMobile?: boolean;
}

/**
 * Renders aggregate + per-temperature variants with automatic tab controls.
 * If only one real temperature sample is provided, tabs are hidden and we
 * simply render the single EvaluationView.
 */
const TemperatureTabbedEvaluation: React.FC<TemperatureTabbedEvaluationProps> = ({
  variants,
  idealResponse,
  expandedLogs,
  toggleLogExpansion,
  isMobile = false,
}) => {
  if (!variants || variants.length === 0) {
    return null;
  }

  const aggregateBundle = variants[0];
  const tempBundles = variants.slice(1); // remaining are real temps

  const [active, setActive] = useState<'agg' | number>('agg');

  const activeBundle = active === 'agg'
    ? aggregateBundle
    : tempBundles.find(v => v.temperature === active) || aggregateBundle;

  return (
    <>
      {tempBundles.length > 0 && (
        <Tabs
          value={active === 'agg' ? 'agg' : active.toString()}
          onValueChange={v => setActive(v === 'agg' ? 'agg' : Number(v))}
          className="my-2"
        >
          <TabsList>
            <TabsTrigger value="agg">Aggregate</TabsTrigger>
            {tempBundles.map(tb => (
              <TabsTrigger key={tb.temperature ?? 'x'} value={(tb.temperature ?? 0).toString()}>
                T {tb.temperature}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <EvaluationView
        assessments={activeBundle.assessments}
        modelResponse={activeBundle.modelResponse}
        idealResponse={idealResponse}
        expandedLogs={expandedLogs}
        toggleLogExpansion={toggleLogExpansion}
        isMobile={isMobile}
        generatedTranscript={activeBundle.generatedTranscript}
        generatedHistory={activeBundle.generatedHistory as any}
      />
    </>
  );
};

export default TemperatureTabbedEvaluation;
