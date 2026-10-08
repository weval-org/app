'use client';

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { PairwiseComparisonForm } from './PairwiseComparisonForm';


const PairsPage = () => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="container mx-auto py-12 px-4">
      <header className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight text-primary mb-4">Help Us Evaluate AI</h1>
        {!showDetails && (
          <button
            onClick={() => setShowDetails(true)}
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            Learn more about this project
          </button>
        )}
        {showDetails && (
          <div className="mt-4 max-w-2xl mx-auto space-y-3">
            <p className="text-lg text-muted-foreground">
              Help improve AI evaluation by choosing the better response between two models for a given prompt. Your feedback provides valuable data for our research.
            </p>
            <p className="text-sm text-muted-foreground">
              Your contributions are anonymous and help build an open dataset for AI research. Responses are randomly positioned to reduce bias.
            </p>
            <p className="text-sm text-muted-foreground">
              Weval is a project by the <a href="https://www.cip.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Collective Intelligence Project</a>.
            </p>
            <button
              onClick={() => setShowDetails(false)}
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Show less
            </button>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto">
        <Card className="shadow-2xl">
          <CardContent className="pt-6">
            <PairwiseComparisonForm />
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default PairsPage;
