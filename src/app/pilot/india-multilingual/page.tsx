import { Metadata } from 'next';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { V2Client, ComparativeResults, SampleComparison, RubricSummary, OverlapWorkersData, HumanLLMAgreementData } from './V2Client';
import type {
  ExpertSummaryData,
  ExpertVsNonExpertData,
  ExpertDistrustData,
  ExpertFeedbackHighlights,
} from './components/ExpertLensSection';

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

// S3 configuration
const PILOT_DATA_PREFIX = 'live/pilots/india-multilingual';

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

const streamToString = (stream: Readable): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });

async function fetchFromS3<T>(filename: string): Promise<T | null> {
  const key = `${PILOT_DATA_PREFIX}/${filename}`;
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: key,
    });
    const { Body } = await s3Client.send(command);

    if (Body) {
      const content = await streamToString(Body as Readable);
      return JSON.parse(content);
    }
    return null;
  } catch (error: any) {
    if (error.name !== 'NoSuchKey') {
      console.error(`[india-multilingual] Failed to fetch ${key}:`, error.message);
    }
    return null;
  }
}

export default async function IndiaMultilingualPage() {
  const [
    comparativeResults,
    sampleComparisons,
    rubricSummary,
    overlapWorkers,
    humanLLMAgreement,
    // Expert data
    expertSummary,
    expertVsNonExpert,
    expertDistrustCases,
    expertFeedbackHighlights,
  ] = await Promise.all([
    fetchFromS3<ComparativeResults>('comparative_results.json'),
    fetchFromS3<SampleComparison[]>('comparison_samples.json'),
    fetchFromS3<RubricSummary>('rubric_summary.json'),
    fetchFromS3<OverlapWorkersData>('overlap_workers.json'),
    fetchFromS3<HumanLLMAgreementData>('human_llm_agreement.json'),
    // Expert data files
    fetchFromS3<ExpertSummaryData>('expert_summary.json'),
    fetchFromS3<ExpertVsNonExpertData>('expert_vs_nonexpert.json'),
    fetchFromS3<ExpertDistrustData>('expert_distrust_cases.json'),
    fetchFromS3<ExpertFeedbackHighlights>('expert_feedback_highlights.json'),
  ]);

  if (!comparativeResults) {
    // In development, fall back to mock data so the page is previewable without S3
    if (process.env.NODE_ENV === 'development') {
      const fallback: ComparativeResults = {
        totalComparisons: 10600, totalWorkers: 128, opusWinRate: 0.63,
        overall: { opus: 4200, sonnet: 2500, equal_good: 3200, equal_bad: 700 },
        byLanguage: {
          Hindi: { opus: 800, sonnet: 500, equal_good: 600, equal_bad: 100, total: 2000 },
          Bengali: { opus: 700, sonnet: 400, equal_good: 500, equal_bad: 80, total: 1680 },
          Telugu: { opus: 600, sonnet: 350, equal_good: 450, equal_bad: 90, total: 1490 },
          Kannada: { opus: 550, sonnet: 320, equal_good: 400, equal_bad: 85, total: 1355 },
          Malayalam: { opus: 500, sonnet: 300, equal_good: 380, equal_bad: 80, total: 1260 },
          Assamese: { opus: 520, sonnet: 310, equal_good: 420, equal_bad: 130, total: 1380 },
          Marathi: { opus: 530, sonnet: 320, equal_good: 450, equal_bad: 135, total: 1435 },
        },
        topWorkers: [],
      };
      return (
        <V2Client
          comparativeResults={fallback}
          sampleComparisons={[]}
          rubricSummary={null}
          overlapWorkers={null}
          humanLLMAgreement={null}
          expertSummary={null}
          expertVsNonExpert={null}
          expertDistrustCases={null}
          expertFeedbackHighlights={null}
        />
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Data not found.</p>
      </div>
    );
  }

  return (
    <V2Client
      comparativeResults={comparativeResults}
      sampleComparisons={sampleComparisons || []}
      rubricSummary={rubricSummary}
      overlapWorkers={overlapWorkers}
      humanLLMAgreement={humanLLMAgreement}
      // Expert data
      expertSummary={expertSummary}
      expertVsNonExpert={expertVsNonExpert}
      expertDistrustCases={expertDistrustCases}
      expertFeedbackHighlights={expertFeedbackHighlights}
    />
  );
}
