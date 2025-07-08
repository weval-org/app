'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import dynamic from 'next/dynamic';

const HelpCircle = dynamic(() => import('lucide-react').then(mod => mod.HelpCircle), { ssr: false });

// This is a placeholder component.
// In the future, this will:
// 1. Be rendered in a new "Human Preferences" tab on the analysis page.
// 2. Fetch data from a new API endpoint, e.g., `/api/pairs/run-summary/[configId]/[runLabel]/[timestamp]`.
// 3. Display the aggregated human preference data in a clear and meaningful way.
//    - This could include ELO scores, win/loss/draw matrices, etc.

export interface HumanPreferencesViewProps {
  configId: string;
  runLabel: string;
  timestamp: string;
}

const HumanPreferencesView: React.FC<HumanPreferencesViewProps> = ({
  configId,
  runLabel,
  timestamp,
}) => {
  return (
    <Card className="shadow-lg border-border dark:border-border">
      <CardHeader>
        <CardTitle className="text-primary">Human Preference Results</CardTitle>
        <CardDescription>
          This section shows aggregated results from direct human comparisons of model responses from this run.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert variant="default" className="border-sky-500/50 dark:border-sky-400/30 bg-sky-50/50 dark:bg-sky-900/10">
          <HelpCircle className="h-4 w-4 text-sky-600" />
          <AlertTitle className="text-sky-800 dark:text-sky-300">Feature in Development</AlertTitle>
          <AlertDescription className="text-sky-900 dark:text-sky-400/90">
            This component is a placeholder for displaying human preference data. The data collection and aggregation pipeline is currently being built.
            Once complete, this view will show how human evaluators rated the different model responses against each other for the prompts in this evaluation.
          </AlertDescription>
        </Alert>

        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">Data to be displayed here:</h3>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li>Pairwise win/loss/draw matrix for all models.</li>
            <li>Calculated ELO scores for each model based on preferences.</li>
            <li>A list of the most insightful human-provided reasons for their choices.</li>
            <li>Breakdowns by prompt to see which were most or least contentious for human evaluators.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default HumanPreferencesView; 