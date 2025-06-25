import BetaComparisonClientPage from '@/app/(full)/analysis/[configId]/[runLabel]/[timestamp]/BetaComparisonClientPage';
import { ComparisonDataV2 } from '@/app/utils/types';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

interface PlaygroundResultsPageProps {
  params: Promise<{
    playgroundId: string;
  }>;
}

// Ensure the page is not cached and rendered dynamically
export const revalidate = 0;

const PLAYGROUND_TEMP_DIR = 'playground';

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


async function getPlaygroundResult(playgroundId: string): Promise<ComparisonDataV2 | null> {
    const resultKey = `${PLAYGROUND_TEMP_DIR}/runs/${playgroundId}/_comparison.json`;

    try {
        const command = new GetObjectCommand({
            Bucket: process.env.APP_S3_BUCKET_NAME!,
            Key: resultKey,
        });
        const { Body } = await s3Client.send(command);
        
        if (Body) {
            const content = await streamToString(Body as Readable);
            return JSON.parse(content);
        } else {
            return null;
        }
    } catch (error: any) {
        if (error.name !== 'NoSuchKey') {
            // We log the error but don't expose details to the client.
            // NoSuchKey is an expected error if the file isn't ready.
            console.error(`Failed to fetch playground result for ${playgroundId}`, error);
        }
        return null;
    }
}

export async function generateMetadata({ params }: PlaygroundResultsPageProps): Promise<Metadata> {
    const { playgroundId } = await params;
    const data = await getPlaygroundResult(playgroundId);
    const title = data?.configTitle ? `${data.configTitle} (Playground)` : 'Playground Result';
    const description = data?.config?.description || 'A custom blueprint evaluation run in the playground.';

    return {
        title: title,
        description: description,
        openGraph: {
            title: title,
            description: description,
        },
    };
}


export default async function PlaygroundResultPage({ params }: PlaygroundResultsPageProps) {
  const { playgroundId } = await params;
  const data = await getPlaygroundResult(playgroundId);

  if (!data) {
    return notFound();
  }

  // The BetaComparisonClientPage expects the data in a specific prop.
  // We pass the fetched data directly to it.
  return <BetaComparisonClientPage data={data} isPlayground={true} />;
}
