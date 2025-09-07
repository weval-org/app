import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, VenetianMask } from 'lucide-react';
import { getModelDisplayLabel } from '@/app/utils/modelIdUtils';

// Types to match the new `CompassComparisonPair` structure
interface CompassExemplar {
  promptText: string;
  modelId: string;
  modelResponse: string;
  potency?: number;
}

interface CompassComparisonPair {
  promptText: string;
  positiveExemplar: CompassExemplar;
  negativeExemplar: CompassExemplar;
}

interface CompassAxisExemplars {
  comparisonPairs?: CompassComparisonPair[];
}

interface CompassIndex {
  axisMetadata?: Record<string, { id: string; positivePole: string; negativePole: string }>;
  exemplars?: Record<string, CompassAxisExemplars>;
}

interface ComparisonCardProps {
  pair: CompassComparisonPair;
  positivePoleName: string;
  negativePoleName: string;
}

const ComparisonCard: React.FC<ComparisonCardProps> = ({ pair, positivePoleName, negativePoleName }) => {
  const { promptText, positiveExemplar, negativeExemplar } = pair;
  const posDisplayName = getModelDisplayLabel(positiveExemplar.modelId, { prettifyModelName: true, hideProvider: true });
  const negDisplayName = getModelDisplayLabel(negativeExemplar.modelId, { prettifyModelName: true, hideProvider: true });

  return (
    <div className="bg-card p-4 rounded-lg border text-sm text-card-foreground break-inside-avoid">
      <p className="font-semibold text-muted-foreground mb-2">Scenario:</p>
      <p className="mb-4 italic">"{promptText}"</p>
      <Separator />
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 mt-4">
        {/* Positive Response */}
        <div>
          <h5 className="font-semibold text-center mb-2">{positivePoleName}</h5>
          <div className="whitespace-pre-wrap font-mono text-xs bg-muted p-3 rounded-md">
            {positiveExemplar.modelResponse}
          </div>
          <p className="text-xs text-muted-foreground text-right mt-2">
            - <span className="font-semibold text-primary">{posDisplayName}</span>
          </p>
        </div>

        {/* Negative Response */}
        <div>
          <h5 className="font-semibold text-center mb-2">{negativePoleName}</h5>
          <div className="whitespace-pre-wrap font-mono text-xs bg-muted p-3 rounded-md">
            {negativeExemplar.modelResponse}
          </div>
          <p className="text-xs text-muted-foreground text-right mt-2">
            - <span className="font-semibold text-primary">{negDisplayName}</span>
          </p>
        </div>
      </div>
    </div>
  );
};


interface ExemplarGalleryProps {
  compass: CompassIndex;
}

const ExemplarGallery: React.FC<ExemplarGalleryProps> = ({ compass }) => {
  if (!compass?.exemplars || !compass?.axisMetadata) {
    return null;
  }

  const { exemplars, axisMetadata } = compass;
  const axesWithExemplars = Object.keys(axisMetadata).filter(axisId => 
    exemplars[axisId]?.comparisonPairs && exemplars[axisId].comparisonPairs!.length > 0
  );

  if (axesWithExemplars.length === 0) {
    return null;
  }

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <VenetianMask className="w-6 h-6 text-primary" />
          </div>
          <div>
            <CardTitle>Behavioral Showdowns</CardTitle>
            <CardDescription>
              Direct comparisons of model responses to the same prompt, showcasing opposing personality traits.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8">
        {axesWithExemplars.map((axisId, idx) => {
          const metadata = axisMetadata[axisId];
          const axisExemplars = exemplars[axisId];

          return (
            <div key={axisId}>
              <h3 className="text-xl font-semibold mb-4 tracking-tight">{metadata.positivePole} vs. {metadata.negativePole}</h3>
              <div className="space-y-4">
                {axisExemplars.comparisonPairs?.map((pair, index) => (
                  <ComparisonCard 
                    key={`${axisId}-pair-${index}`} 
                    pair={pair}
                    positivePoleName={metadata.positivePole}
                    negativePoleName={metadata.negativePole}
                  />
                ))}
              </div>
              {idx < axesWithExemplars.length - 1 && (
                <Separator className="my-8" />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default ExemplarGallery;
