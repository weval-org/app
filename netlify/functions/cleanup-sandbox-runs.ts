import { Handler, schedule } from '@netlify/functions';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, ObjectIdentifier, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { getLogger } from '../../src/utils/logger';
import { initSentry, captureError, setContext, flushSentry } from '../../src/utils/sentry';

const PLAYGROUND_TEMP_DIR = 'live/sandbox';
const RUNS_PREFIX = `${PLAYGROUND_TEMP_DIR}/runs/`;
const CLEANUP_AGE_DAYS = 7; // Delete runs older than 7 days

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

const cleanupHandler: Handler = async () => {
  // Initialize Sentry for this function
  initSentry('cleanup-sandbox-runs');

  // Set Sentry context for this invocation
  setContext('cleanupSandbox', {
    cleanupAgeDays: CLEANUP_AGE_DAYS,
  });

  const logger = await getLogger('sandbox:cleanup:cron');
  logger.info(`Starting cleanup job. Deleting runs older than ${CLEANUP_AGE_DAYS} days.`);
  
  const now = new Date();
  const cutoffTime = now.getTime() - CLEANUP_AGE_DAYS * 24 * 60 * 60 * 1000;
  const objectsToDelete: ObjectIdentifier[] = [];

  try {
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
        const listCommand: ListObjectsV2Command = new ListObjectsV2Command({
            Bucket: process.env.APP_S3_BUCKET_NAME!,
            Prefix: RUNS_PREFIX,
            ContinuationToken: continuationToken,
        });

        const listResponse: ListObjectsV2CommandOutput = await s3Client.send(listCommand);

        if (listResponse.Contents) {
            for (const object of listResponse.Contents) {
                if (object.Key) {
                    // Extract runId from the key, e.g., sandbox/runs/1622548800000-some-uuid/status.json
                    const keyParts = object.Key.replace(RUNS_PREFIX, '').split('/');
                    const runId = keyParts[0];

                    if (runId) {
                         // The timestamp is the first part of the runId
                        const timestampStr = runId.split('-')[0];
                        const runTimestamp = parseInt(timestampStr, 10);

                        if (!isNaN(runTimestamp) && runTimestamp < cutoffTime) {
                            objectsToDelete.push({ Key: object.Key });
                        }
                    }
                }
            }
        }
        
        isTruncated = listResponse.IsTruncated ?? false;
        continuationToken = listResponse.NextContinuationToken;
    }

    if (objectsToDelete.length > 0) {
        // Deduplicate objects to delete, as we might have added multiple files from the same old run
        const uniqueKeysToDelete = Array.from(new Set(objectsToDelete.map(o => o.Key))).map(key => ({ Key: key }));

        logger.info(`Found ${uniqueKeysToDelete.length} objects from expired runs to delete.`);

        // S3 DeleteObjects can handle up to 1000 keys at a time
        const batchSize = 1000;
        for (let i = 0; i < uniqueKeysToDelete.length; i += batchSize) {
            const batch = uniqueKeysToDelete.slice(i, i + batchSize);
            const deleteCommand = new DeleteObjectsCommand({
                Bucket: process.env.APP_S3_BUCKET_NAME!,
                Delete: { Objects: batch },
            });

            const deleteResult = await s3Client.send(deleteCommand);
            if (deleteResult.Errors && deleteResult.Errors.length > 0) {
                 logger.error(`Encountered ${deleteResult.Errors.length} errors during batch deletion.`);
                 deleteResult.Errors.forEach(err => logger.error(` - Key: ${err.Key}, Code: ${err.Code}, Message: ${err.Message}`));
                 // Capture S3 deletion errors
                 deleteResult.Errors.forEach(err => {
                   captureError(new Error(`S3 delete error: ${err.Code} - ${err.Message}`), {
                     key: err.Key,
                     code: err.Code,
                   });
                 });
            } else {
                 logger.info(`Successfully deleted batch of ${batch.length} objects.`);
            }
        }
    } else {
        logger.info("No expired sandbox runs found to delete.");
    }

    logger.info("Cleanup job finished.");
    await flushSentry();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Cleanup complete. Deleted ${objectsToDelete.length} objects.` }),
    };
  } catch (error: any) {
    const errorContext = {
      message: error.message,
      stack: error.stack,
      name: error.name,
    };

    logger.error(`An error occurred during cleanup`, error);
    captureError(error, errorContext);

    // Ensure Sentry events are sent before function exits
    await flushSentry();

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

export const handler = schedule('0 2 * * *', cleanupHandler);
