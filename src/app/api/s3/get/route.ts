import { NextRequest, NextResponse } from 'next/server';
import { getJsonFile } from '@/lib/storageService';
import { getLogger } from '@/utils/logger';

/**
 * Generic S3 file getter
 * Accepts a key as query parameter and returns the JSON content from S3
 */
export async function GET(request: NextRequest) {
  const logger = await getLogger('s3:get');
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json(
      {
        error: 'Missing required parameter',
        message: 'key parameter is required',
      },
      { status: 400 }
    );
  }

  try {
    const data = await getJsonFile(key);

    if (!data) {
      logger.warn(`[s3:get] File not found: ${key}`);
      return NextResponse.json(
        {
          error: 'File not found',
          message: `No file found at key: ${key}`,
        },
        { status: 404 }
      );
    }

    logger.info(`[s3:get] Retrieved: ${key}`);
    return NextResponse.json(data);
  } catch (error: any) {
    logger.error(`[s3:get] Failed for ${key}: ${error?.message || error}`);
    return NextResponse.json(
      {
        error: 'Failed to retrieve file',
        details: error?.message,
      },
      { status: 500 }
    );
  }
}
