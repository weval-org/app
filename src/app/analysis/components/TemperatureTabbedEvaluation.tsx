'use client';

import React, { useState } from 'react';
import { PointAssessment } from '@/app/utils/types';
import { EvaluationView } from '@/app/analysis/components/SharedEvaluationComponents';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface TempVariantBundle {
  temperature: number | null; // per-temperature entry
  assessments: PointAssessment[];
  modelResponse: string;
  // Optional aggregated transcript of generated assistant turns for this variant/temp
  generatedTranscript?: string;
  // Optional structured history for nicer rendering
  generatedHistory?: any[];
  // For aggregate: array of per-temperature outputs to render sequentially
  perTemperatureOutputs?: Array<{ temperature: number; generatedHistory?: any[]; generatedTranscript?: string; modelResponse?: string }>;
}

interface TemperatureTabbedEvaluationProps {
  variants: TempVariantBundle[]; // list of per-temperature variants; no aggregate
  idealResponse?: string;
  expandedLogs: Record<number, boolean>;
  toggleLogExpansion: (idx: number) => void;
  isMobile?: boolean;
}

/**
 * Renders per-temperature variants with automatic tab controls.
 * If only a single temperature is provided, tabs are hidden and we
 * simply render that single EvaluationView.
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

  const tempBundles = variants;
  const [activeIdx, setActiveIdx] = useState<number>(0);

  const activeBundle = tempBundles[activeIdx] || tempBundles[0];

  return (
    <>
      {tempBundles.length > 1 && (
        <Tabs
          value={activeIdx.toString()}
          onValueChange={v => setActiveIdx(Number(v))}
          className="my-2"
        >
          <TabsList>
            {tempBundles.map((tb, idx) => (
              <TabsTrigger key={`${idx}`} value={idx.toString()}>
                {tb.temperature === null ? 'All' : `T ${tb.temperature}`}
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
        generatedHistoryByTemp={activeBundle.perTemperatureOutputs?.map(o => ({
          temperature: o.temperature,
          history: o.generatedHistory as any,
          transcript: o.generatedTranscript,
          text: o.modelResponse,
        }))}
      />
    </>
  );
};

export default TemperatureTabbedEvaluation;
