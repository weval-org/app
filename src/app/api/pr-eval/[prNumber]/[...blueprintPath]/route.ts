import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

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

/**
 * Generate storage path for PR evaluation
 */
function getPRStoragePath(prNumber: string, blueprintPath: string): string {
  // Sanitize blueprint path (same logic as background function)
  const sanitized = blueprintPath
    .replace(/^blueprints\/users\//, '')
    .replace(/\.ya?ml$/, '')
    .replace(/\//g, '-');

  return `live/pr-evals/${prNumber}/${sanitized}`;
}

/**
 * Fetch file from S3
 */
async function fetchFromS3(key: string): Promise<string | null> {
  try {
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: key,
    }));

    if (response.Body) {
      return await streamToString(response.Body as Readable);
    }
    return null;
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      return null;
    }
    console.error(`[PR Eval API] Error fetching ${key}:`, error.message);
    throw error;
  }
}

/**
 * GET /api/pr-eval/[prNumber]/[...blueprintPath]
 * Fetches status and results for a PR evaluation
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ prNumber: string; blueprintPath: string[] }> }
) {
  const { prNumber, blueprintPath } = await params;
  const blueprintPathStr = blueprintPath.join('/');

  console.log(`[PR Eval API] Fetching data for PR #${prNumber}, blueprint: ${blueprintPathStr}`);

  try {
    const basePath = getPRStoragePath(prNumber, blueprintPathStr);

    // Fetch all relevant data
    const [metadataStr, statusStr, blueprintStr, resultStr] = await Promise.all([
      fetchFromS3(`${basePath}/pr-metadata.json`),
      fetchFromS3(`${basePath}/status.json`),
      fetchFromS3(`${basePath}/blueprint.yml`),
      fetchFromS3(`${basePath}/_comparison.json`),
    ]);

    // Parse metadata
    const metadata = metadataStr ? JSON.parse(metadataStr) : null;

    // Parse status
    const status = statusStr ? JSON.parse(statusStr) : null;

    // Parse results (if available)
    const results = resultStr ? JSON.parse(resultStr) : null;

    // If nothing exists, return 404
    if (!metadata && !status) {
      return NextResponse.json(
        { error: 'Evaluation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      prNumber: parseInt(prNumber),
      blueprintPath: blueprintPathStr,
      metadata,
      status,
      blueprint: blueprintStr,
      results,
    });

  } catch (error: any) {
    console.error('[PR Eval API] Error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
