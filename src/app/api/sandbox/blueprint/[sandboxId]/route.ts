import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const PLAYGROUND_TEMP_DIR = 'sandbox';

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(
  req: NextRequest,
  { params }: { params: { sandboxId: string } }
) {
  const { sandboxId } = params;

  if (!sandboxId) {
    return NextResponse.json({ error: 'Sandbox ID is required' }, { status: 400 });
  }

  const blueprintKey = `${PLAYGROUND_TEMP_DIR}/runs/${sandboxId}/blueprint.yml`;

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: blueprintKey,
    });
    const { Body, ContentType } = await s3Client.send(command);

    if (!Body) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }

    // Since we know the body is a readable stream, we can cast it
    const readableStream = Body as Readable;

    return new NextResponse(readableStream as any, {
      status: 200,
      headers: {
        'Content-Type': ContentType || 'application/yaml',
        'Content-Disposition': `attachment; filename="blueprint-${sandboxId}.yml"`,
      },
    });
  } catch (error: any) {
    if (error.name === 'NoSuchKey') {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 });
    }
    console.error(`[Sandbox Blueprint Download Error]`, error);
    return NextResponse.json({ error: 'Failed to fetch blueprint' }, { status: 500 });
  }
} 