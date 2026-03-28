/**
 * S3-backed blob store that provides a compatible interface to replace @netlify/blobs.
 *
 * This module provides getStore() which returns an object with get/set/list/setJSON methods,
 * matching the subset of the Netlify Blobs API used by the pairwise task queue and pairs API.
 */

import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Client = new S3Client({
    region: process.env.APP_S3_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY || '',
    },
});

const BUCKET = () => process.env.APP_S3_BUCKET_NAME || '';
const BLOB_PREFIX = 'blob-store';

function makeKey(storeName: string, key: string): string {
    return `${BLOB_PREFIX}/${storeName}/${key}`;
}

async function streamToString(stream: Readable | ReadableStream | Blob): Promise<string> {
    if (stream instanceof Readable) {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            stream.on('error', reject);
            stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        });
    }
    // Handle web ReadableStream
    if (typeof (stream as any).getReader === 'function') {
        const reader = (stream as ReadableStream).getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) chunks.push(value);
        }
        return Buffer.concat(chunks).toString('utf-8');
    }
    return String(stream);
}

export interface BlobStore {
    get(key: string, options?: { type?: 'json' | 'text' }): Promise<any>;
    set(key: string, value: string): Promise<void>;
    setJSON(key: string, value: any): Promise<void>;
    delete(key: string): Promise<void>;
    list(): Promise<{ blobs: Array<{ key: string }> }>;
}

export interface GetStoreOptions {
    name: string;
    siteID?: string;
    token?: string;
}

/**
 * Returns an S3-backed store that mimics the @netlify/blobs getStore API.
 */
export function getStore(options: GetStoreOptions | string): BlobStore {
    const storeName = typeof options === 'string' ? options : options.name;

    return {
        async get(key: string, opts?: { type?: 'json' | 'text' }): Promise<any> {
            try {
                const result = await s3Client.send(new GetObjectCommand({
                    Bucket: BUCKET(),
                    Key: makeKey(storeName, key),
                }));
                const body = await streamToString(result.Body as Readable);
                if (opts?.type === 'json') {
                    return JSON.parse(body);
                }
                return body;
            } catch (error: any) {
                if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
                    return undefined;
                }
                throw error;
            }
        },

        async set(key: string, value: string): Promise<void> {
            await s3Client.send(new PutObjectCommand({
                Bucket: BUCKET(),
                Key: makeKey(storeName, key),
                Body: value,
                ContentType: 'text/plain',
            }));
        },

        async setJSON(key: string, value: any): Promise<void> {
            await s3Client.send(new PutObjectCommand({
                Bucket: BUCKET(),
                Key: makeKey(storeName, key),
                Body: JSON.stringify(value),
                ContentType: 'application/json',
            }));
        },

        async delete(key: string): Promise<void> {
            try {
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: BUCKET(),
                    Key: makeKey(storeName, key),
                }));
            } catch (error: any) {
                // Ignore 404s on delete
                if (error.name !== 'NoSuchKey' && error.$metadata?.httpStatusCode !== 404) {
                    throw error;
                }
            }
        },

        async list(): Promise<{ blobs: Array<{ key: string }> }> {
            const prefix = `${BLOB_PREFIX}/${storeName}/`;
            const blobs: Array<{ key: string }> = [];
            let continuationToken: string | undefined;

            do {
                const result = await s3Client.send(new ListObjectsV2Command({
                    Bucket: BUCKET(),
                    Prefix: prefix,
                    ContinuationToken: continuationToken,
                }));

                if (result.Contents) {
                    for (const obj of result.Contents) {
                        if (obj.Key) {
                            // Strip the prefix to get the blob key
                            const blobKey = obj.Key.substring(prefix.length);
                            if (blobKey) {
                                blobs.push({ key: blobKey });
                            }
                        }
                    }
                }

                continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
            } while (continuationToken);

            return { blobs };
        },
    };
}
