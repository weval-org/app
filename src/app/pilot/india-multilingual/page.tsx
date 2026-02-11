import { Metadata } from 'next';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
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
  const [comparativeResults, sampleComparisons, rubricSummary, overlapWorkers] = await Promise.all([
    fetchFromS3('comparative_results.json'),
    fetchFromS3('comparison_samples.json'),
    fetchFromS3('rubric_summary.json'),
    fetchFromS3('overlap_workers.json'),
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
      sampleComparisons={sampleComparisons || []}
      rubricSummary={rubricSummary}
      overlapWorkers={overlapWorkers}
    />
  );
}
