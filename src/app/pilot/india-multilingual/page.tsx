import { Metadata } from 'next';
import { getCoreResult } from '@/lib/storageService';
import { PilotClient } from './PilotClient';
import fs from 'fs/promises';
import path from 'path';

// Hardcoded for this specific pilot - no dynamic routing needed
const CONFIG_ID = '.._____india-multilingual__india-multilingual-full';
const RUN_LABEL = 'india-multilingual-full_e74330710b1e01ee';
const TIMESTAMP = '2026-02-10T15-48-27-773Z';

// Load comparative results from JSON
async function getComparativeResults() {
  try {
    const filePath = path.join(process.cwd(), '..', '___india-multilingual', 'comparative_results.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[page.tsx] Failed to load comparative results:', error);
    return null;
  }
}

export const metadata: Metadata = {
  title: 'India Multilingual Evaluation | Human vs LLM Agreement',
  description: 'Comparing human evaluator ratings with LLM judge scores on multilingual Indian language content.',
};

export default async function IndiaMultilingualPilotPage() {
  // Load core data and comparative results server-side
  const [coreData, comparativeResults] = await Promise.all([
    getCoreResult(CONFIG_ID, RUN_LABEL, TIMESTAMP),
    getComparativeResults(),
  ]);

  if (!coreData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Pilot data not found.</p>
      </div>
    );
  }

  // Extract what we need for the narrative
  const pilotData = {
    configId: CONFIG_ID,
    runLabel: RUN_LABEL,
    timestamp: TIMESTAMP,
    title: coreData.configTitle || 'India Multilingual Evaluation',
    description: coreData.description,
    promptIds: coreData.promptIds || [],
    models: coreData.effectiveModels || [],
    humanLLMAgreement: (coreData as any).humanLLMAgreement || null,
    humanLLMAgreementHighReliability: (coreData as any).humanLLMAgreementHighReliability || null,
    dataQuality: (coreData as any).dataQuality || null,
    executiveSummary: coreData.executiveSummary,
    llmCoverageScores: coreData.evaluationResults?.llmCoverageScores || null,
    promptContexts: coreData.promptContexts || {},
    comparativeResults: comparativeResults || null,
  };

  return <PilotClient data={pilotData} />;
}
