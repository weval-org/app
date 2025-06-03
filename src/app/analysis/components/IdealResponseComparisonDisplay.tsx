import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import dynamic from 'next/dynamic';
import { findIdealExtremes } from '@/app/utils/similarityUtils';

// Dynamically import Lucide icon
const Star = dynamic(() => import("lucide-react").then((mod) => mod.Star));

interface IdealResponseComparisonDisplayProps {
  promptSimilarities: Record<string, Record<string, number>> | undefined;
  models: string[];
  promptResponses: Record<string, string> | undefined;
  idealModelId: string;
}

const IdealResponseComparisonDisplay: React.FC<IdealResponseComparisonDisplayProps> = ({
  promptSimilarities,
  models,
  promptResponses,
  idealModelId,
}) => {

  // --- DEBUGGING --- 
  console.log('[IdealResponseComparisonDisplay] Props:', { promptSimilarities, models, promptResponses, idealModelId });
  // --- END DEBUGGING ---

  if (!promptSimilarities || !promptResponses || !models || !promptResponses[idealModelId]) {
    // Don't render if essential data is missing or ideal response text is not found
    console.warn('[IdealResponseComparisonDisplay] Rendering null due to missing data.');
    return null;
  }

  // Calculate extremes specifically for this prompt's similarities
  const { mostSimilar, leastSimilar } = findIdealExtremes(promptSimilarities, idealModelId);

  // --- DEBUGGING --- 
  console.log('[IdealResponseComparisonDisplay] findIdealExtremes result:', { mostSimilar, leastSimilar });
  console.log('[IdealResponseComparisonDisplay] Model IDs:', { mostSimilarId: mostSimilar?.modelId, leastSimilarId: leastSimilar?.modelId });
  console.log('[IdealResponseComparisonDisplay] Attempting response lookup using these IDs...');
  // --- END DEBUGGING ---

  const idealResponseText = promptResponses[idealModelId];
  const closestResponseText = mostSimilar?.modelId ? promptResponses[mostSimilar.modelId] : null;
  const furthestResponseText = leastSimilar?.modelId ? promptResponses[leastSimilar.modelId] : null;

  // --- DEBUGGING --- 
  console.log('[IdealResponseComparisonDisplay] Looked up responses:', { closestResponseText, furthestResponseText });
  // --- END DEBUGGING ---

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">

      {/* Ideal Response Card */}
      <Card className="bg-emerald-50 border border-emerald-300 flex flex-col ring-2 ring-emerald-500">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-md text-emerald-800">
            <Star className="inline h-4 w-4 mr-1 text-emerald-600" />
            Ideal Response
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-emerald-900 whitespace-pre-wrap overflow-y-auto max-h-[300px] flex-grow pt-0 pb-4 scroll-fade-bottom">
          {idealResponseText}
        </CardContent>
      </Card>
      {/* Closest Response Card - Changed to Blue */}
      <Card className="bg-sky-50 border border-sky-200 flex flex-col">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-md text-sky-800">
            Closest: {mostSimilar ? `${mostSimilar.modelId} (${mostSimilar.value.toFixed(3)})` : 'N/A'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-sky-900 whitespace-pre-wrap overflow-y-auto max-h-[300px] flex-grow pt-0 pb-4 scroll-fade-bottom">
          {closestResponseText || 'Response not available.'}
        </CardContent>
      </Card>

      {/* Furthest Response Card */}
      <Card className="bg-orange-50 border border-orange-200 flex flex-col">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-md text-orange-800">
            Furthest: {leastSimilar ? `${leastSimilar.modelId} (${leastSimilar.value.toFixed(3)})` : 'N/A'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-orange-900 whitespace-pre-wrap overflow-y-auto max-h-[300px] flex-grow pt-0 pb-4 scroll-fade-bottom">
          {furthestResponseText || 'Response not available.'}
        </CardContent>
      </Card>
    </div>
  );
};

export default IdealResponseComparisonDisplay; 