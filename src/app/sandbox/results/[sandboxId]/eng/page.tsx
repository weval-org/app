import { ComparisonDataV2 } from '@/app/utils/types';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { AnalysisProvider } from '@/app/analysis/context/AnalysisProvider';
import { EngClientPage } from '@/app/analysis/[configId]/[runLabel]/[timestamp]/eng/EngClientPage';

interface SandboxEngPageProps {
  params: Promise<{
    sandboxId: string; // This is the runId
  }>;
}

// Ensure the page is not cached and rendered dynamically
export const revalidate = 0;

const CREATOR_TEMP_DIR = 'live/sandbox';

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


async function getSandboxResult(runId: string): Promise<ComparisonDataV2 | null> {
    const resultKey = `${CREATOR_TEMP_DIR}/runs/${runId}/_comparison.json`;

    // Development logging
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Sandbox Eng] Looking for result file at: ${resultKey}`);
    }

    try {
        const command = new GetObjectCommand({
            Bucket: process.env.APP_S3_BUCKET_NAME!,
            Key: resultKey,
        });
        const { Body } = await s3Client.send(command);

        if (Body) {
            const content = await streamToString(Body as Readable);
            const parsedData = JSON.parse(content);

            if (process.env.NODE_ENV === 'development') {
                console.log(`[Sandbox Eng] Loaded data for ${runId}`);
            }

            return parsedData;
        } else {
            return null;
        }
    } catch (error: any) {
        if (error.name !== 'NoSuchKey') {
            console.error(`Failed to fetch sandbox result for ${runId}`, error);
        }
        return null;
    }
}

export async function generateMetadata({ params }: SandboxEngPageProps): Promise<Metadata> {
    const { sandboxId: runId } = await params;
    const data = await getSandboxResult(runId);
    const title = data?.configTitle ? `${data.configTitle} - Data Explorer (Sandbox)` : 'Sandbox Data Explorer';
    const description = data?.config?.description || 'Interactive exploration of sandbox evaluation results.';

    return {
        title: title,
        description: description,
        openGraph: {
            title: title,
            description: description,
        },
    };
}


export default async function SandboxEngPage({ params }: SandboxEngPageProps) {
  const { sandboxId: runId } = await params;
  const data = await getSandboxResult(runId);

  if (!data) {
    return notFound();
  }

  const isSandboxRun = true;

  return (
    <AnalysisProvider
      initialData={data}
      configId={data.config.id!}
      runLabel={data.runLabel}
      timestamp={data.timestamp}
      isSandbox={isSandboxRun}
      sandboxId={runId}
    >
      <EngClientPage />
    </AnalysisProvider>
  );
}
