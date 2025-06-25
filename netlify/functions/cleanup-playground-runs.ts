import { Handler, schedule } from '@netlify/functions';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, ObjectIdentifier, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';

const PLAYGROUND_TEMP_DIR = 'playground';
const RUNS_PREFIX = `${PLAYGROUND_TEMP_DIR}/runs/`;
const CLEANUP_AGE_HOURS = 24; // Delete runs older than 24 hours

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

const logger = {
  info: (message: string) => console.log(`[Playground Cleanup] [INFO] ${message}`),
  warn: (message: string) => console.warn(`[Playground Cleanup] [WARN] ${message}`),
  error: (message: string) => console.error(`[Playground Cleanup] [ERROR] ${message}`),
};

const cleanupHandler: Handler = async () => {
  logger.info(`Starting cleanup job. Deleting runs older than ${CLEANUP_AGE_HOURS} hours.`);
  
  const now = new Date();
  const cutoffTime = now.getTime() - CLEANUP_AGE_HOURS * 60 * 60 * 1000;
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
                    // Extract runId from the key, e.g., playground/runs/1622548800000-some-uuid/status.json
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
            } else {
                 logger.info(`Successfully deleted batch of ${batch.length} objects.`);
            }
        }
    } else {
        logger.info("No expired playground runs found to delete.");
    }

    logger.info("Cleanup job finished.");

    return {
      statusCode: 200,
      body: JSON.stringify({ message: `Cleanup complete. Deleted ${objectsToDelete.length} objects.` }),
    };
  } catch (error: any) {
    logger.error(`An error occurred during cleanup: ${error.message}`);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

export const handler = schedule('0 2 * * *', cleanupHandler);
