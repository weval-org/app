import { Metadata } from 'next';
import fs from 'fs/promises';
import path from 'path';
import { V2Client } from './V2Client';

export const metadata: Metadata = {
  title: 'India Multilingual Evaluation | Opus vs Sonnet',
  description: 'Native speakers of 7 Indian languages compared Claude Opus 4.5 and Sonnet 4.5 on legal and agricultural questions. Opus preferred 63% of the time.',
  openGraph: {
    title: 'India Multilingual Evaluation | Opus vs Sonnet',
    description: 'Native speakers of 7 Indian languages compared Claude Opus 4.5 and Sonnet 4.5 on legal and agricultural questions. Opus preferred 63% of the time.',
    type: 'article',
    siteName: 'weval',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'India Multilingual Evaluation | Opus vs Sonnet',
    description: 'Native speakers of 7 Indian languages compared Claude Opus 4.5 and Sonnet 4.5. Opus preferred 63% of the time.',
  },
};

// Load comparative results
async function getComparativeResults() {
  try {
    const filePath = path.join(process.cwd(), '..', '___india-multilingual', 'comparative_results.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[india-multilingual/page.tsx] Failed to load comparative results:', error);
    return null;
  }
}

// Load sample comparisons for the interactive game (pre-generated JSON)
async function getSampleComparisons() {
  try {
    const filePath = path.join(process.cwd(), '..', '___india-multilingual', 'comparison_samples.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[india-multilingual/page.tsx] Failed to load sample comparisons:', error);
    return [];
  }
}

// Load rubric-based rating summary
async function getRubricSummary() {
  try {
    const filePath = path.join(process.cwd(), '..', '___india-multilingual', 'rubric_summary.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[india-multilingual/page.tsx] Failed to load rubric summary:', error);
    return null;
  }
}

// Load overlap workers analysis
async function getOverlapWorkers() {
  try {
    const filePath = path.join(process.cwd(), '..', '___india-multilingual', 'overlap_workers.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[india-multilingual/page.tsx] Failed to load overlap workers:', error);
    return null;
  }
}

export default async function IndiaMultilingualPage() {
  const [comparativeResults, sampleComparisons, rubricSummary, overlapWorkers] = await Promise.all([
    getComparativeResults(),
    getSampleComparisons(),
    getRubricSummary(),
    getOverlapWorkers(),
  ]);

  if (!comparativeResults) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Data not found.</p>
      </div>
    );
  }

  return (
    <V2Client
      comparativeResults={comparativeResults}
      sampleComparisons={sampleComparisons}
      rubricSummary={rubricSummary}
      overlapWorkers={overlapWorkers}
    />
  );
}
