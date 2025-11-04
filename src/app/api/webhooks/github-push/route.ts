import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import crypto from 'crypto';
import { callBackgroundFunction } from '@/lib/background-function-client';
import { webhookIPLimiter, webhookGlobalLimiter } from '@/lib/webhook-rate-limiter';
import { generateConfigContentHash } from '@/lib/hash-utils';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const UPSTREAM_OWNER = 'weval-org';
const UPSTREAM_REPO = 'configs';
const MAIN_BRANCH = 'main';

const s3Client = new S3Client({
  region: process.env.APP_S3_REGION!,
  credentials: {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
  },
});

interface BlueprintFile {
  filename: string;
  sha: string;
  status: string; // added, modified, removed
}

/**
 * Verify GitHub webhook signature
 */
function verifyWebhookSignature(payload: string, signature: string | null): boolean {
  if (!GITHUB_WEBHOOK_SECRET || !signature) {
    console.warn('[GitHub Push Webhook] Missing webhook secret or signature');
    return false;
  }

  const hmac = crypto.createHmac('sha256', GITHUB_WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

/**
 * Parse blueprint files from push commits
 */
function parseBlueprintFiles(commits: any[]): BlueprintFile[] {
  const blueprintFiles = new Map<string, BlueprintFile>();

  for (const commit of commits) {
    const allFiles = [
      ...(commit.added || []),
      ...(commit.modified || []),
      ...(commit.removed || []),
    ];

    for (const filename of allFiles) {
      // Only process .yml and .yaml files in blueprints/ directory
      if (!filename.startsWith('blueprints/')) {
        continue;
      }

      if (!filename.endsWith('.yml') && !filename.endsWith('.yaml')) {
        continue;
      }

      // Skip PR eval staging directory
      if (filename.startsWith('blueprints/pr-evals/')) {
        continue;
      }

      // Determine status (latest commit wins)
      let status = 'modified';
      if (commit.removed?.includes(filename)) {
        status = 'removed';
      } else if (commit.added?.includes(filename)) {
        status = 'added';
      }

      blueprintFiles.set(filename, {
        filename,
        sha: commit.id,
        status,
      });
    }
  }

  // Filter out removed files
  return Array.from(blueprintFiles.values()).filter(f => f.status !== 'removed');
}

/**
 * Fetch blueprint content from GitHub
 */
async function fetchBlueprintContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  path: string
): Promise<string | null> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in response.data && response.data.type === 'file') {
      return Buffer.from(response.data.content, 'base64').toString('utf-8');
    }
    return null;
  } catch (error: any) {
    console.error(`[GitHub Push Webhook] Failed to fetch ${path}:`, error.message);
    return null;
  }
}

/**
 * Check if blueprint has already been evaluated
 */
async function hasBeenEvaluated(configId: string, contentHash: string): Promise<boolean> {
  try {
    // Check if result file exists
    const resultKey = `live/blueprints/${configId}/${contentHash}_comparison.json`;

    await s3Client.send(new HeadObjectCommand({
      Bucket: process.env.APP_S3_BUCKET_NAME!,
      Key: resultKey,
    }));

    return true; // File exists
  } catch (error: any) {
    if (error.name === 'NotFound') {
      return false; // File doesn't exist
    }
    console.error('[GitHub Push Webhook] Error checking S3:', error.message);
    throw error;
  }
}

/**
 * Parse and validate blueprint
 */
async function parseBlueprint(content: string): Promise<any | null> {
  try {
    const yaml = await import('js-yaml');
    const parsed = yaml.load(content);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const config = parsed as any;

    if (!config.id || typeof config.id !== 'string') {
      return null;
    }

    if (!config.prompts || !Array.isArray(config.prompts) || config.prompts.length === 0) {
      return null;
    }

    return config;
  } catch (error: any) {
    console.error('[GitHub Push Webhook] Parse error:', error.message);
    return null;
  }
}

/**
 * Trigger production evaluation
 */
async function triggerProductionEvaluation(
  config: any,
  commitSha: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[GitHub Push Webhook] Triggering evaluation for ${config.id} (${commitSha})`);

    const response = await callBackgroundFunction({
      functionName: 'execute-evaluation-background',
      body: {
        config,
        commitSha,
      },
      timeout: 10000,
    });

    if (response.ok) {
      console.log(`[GitHub Push Webhook] Successfully triggered evaluation for ${config.id}`);
      return { success: true };
    } else {
      return { success: false, error: response.error || 'Unknown error' };
    }
  } catch (error: any) {
    console.error('[GitHub Push Webhook] Failed to trigger evaluation:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Main webhook handler
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  const event = req.headers.get('x-github-event');

  // Get IP for rate limiting
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ||
             req.headers.get('x-real-ip') ||
             'unknown';

  // Check global rate limit
  const globalLimit = webhookGlobalLimiter.check('global');
  if (!globalLimit.allowed) {
    console.warn('[GitHub Push Webhook] Global rate limit exceeded');
    return NextResponse.json(
      { error: 'Rate limit exceeded globally', retryAfter: globalLimit.retryAfter },
      {
        status: 429,
        headers: { 'Retry-After': String(globalLimit.retryAfter) }
      }
    );
  }

  // Check IP rate limit
  const ipLimit = webhookIPLimiter.check(ip);
  if (!ipLimit.allowed) {
    console.warn(`[GitHub Push Webhook] Rate limit exceeded for IP: ${ip}`);
    return NextResponse.json(
      { error: 'Rate limit exceeded for your IP', retryAfter: ipLimit.retryAfter },
      {
        status: 429,
        headers: { 'Retry-After': String(ipLimit.retryAfter) }
      }
    );
  }

  // Verify signature
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error('[GitHub Push Webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Only handle push events
  if (event !== 'push') {
    return NextResponse.json({ message: 'Event ignored' }, { status: 200 });
  }

  const payload = JSON.parse(rawBody);
  const ref = payload.ref;
  const repository = payload.repository?.full_name;

  // Only handle pushes to main branch of the configs repo
  if (ref !== `refs/heads/${MAIN_BRANCH}`) {
    console.log(`[GitHub Push Webhook] Ignoring push to ${ref} (not main)`);
    return NextResponse.json({ message: 'Not main branch, ignored' }, { status: 200 });
  }

  if (repository !== `${UPSTREAM_OWNER}/${UPSTREAM_REPO}`) {
    console.log(`[GitHub Push Webhook] Ignoring push to ${repository} (not configs repo)`);
    return NextResponse.json({ message: 'Not configs repo, ignored' }, { status: 200 });
  }

  const commits = payload.commits || [];
  const headCommit = payload.head_commit;
  const headSha = headCommit?.id || payload.after;
  const pusher = payload.pusher?.name || 'unknown';

  console.log(`[GitHub Push Webhook] Push to ${MAIN_BRANCH} by ${pusher} (${headSha})`);
  console.log(`[GitHub Push Webhook] Processing ${commits.length} commits`);

  if (!GITHUB_TOKEN) {
    console.error('[GitHub Push Webhook] GITHUB_TOKEN not configured');
    return NextResponse.json({ error: 'GitHub token not configured' }, { status: 500 });
  }

  const octokit = new Octokit({ auth: GITHUB_TOKEN });

  try {
    // Parse blueprint files from commits
    const blueprintFiles = parseBlueprintFiles(commits);

    if (blueprintFiles.length === 0) {
      console.log('[GitHub Push Webhook] No blueprint files in this push');
      return NextResponse.json({ message: 'No blueprints to process' }, { status: 200 });
    }

    console.log(`[GitHub Push Webhook] Found ${blueprintFiles.length} blueprint files`);

    const results = {
      processed: 0,
      skipped: 0,
      triggered: 0,
      errors: [] as string[],
    };

    // Process each blueprint
    for (const file of blueprintFiles) {
      results.processed++;

      console.log(`[GitHub Push Webhook] Processing ${file.filename}...`);

      // Fetch content
      const content = await fetchBlueprintContent(
        octokit,
        UPSTREAM_OWNER,
        UPSTREAM_REPO,
        headSha,
        file.filename
      );

      if (!content) {
        console.error(`[GitHub Push Webhook] Failed to fetch content for ${file.filename}`);
        results.errors.push(`${file.filename}: Failed to fetch content`);
        continue;
      }

      // Parse blueprint
      const config = await parseBlueprint(content);
      if (!config) {
        console.error(`[GitHub Push Webhook] Invalid blueprint: ${file.filename}`);
        results.errors.push(`${file.filename}: Invalid blueprint structure`);
        continue;
      }

      // Calculate content hash
      const modelIds = config.models?.map((m: any) => typeof m === 'string' ? m : m.id) || [];
      const contentHash = generateConfigContentHash({ ...config, models: modelIds });

      // Check if already evaluated
      const alreadyEvaluated = await hasBeenEvaluated(config.id, contentHash);

      if (alreadyEvaluated) {
        console.log(`[GitHub Push Webhook] Blueprint ${config.id} already evaluated (hash: ${contentHash})`);
        results.skipped++;
        continue;
      }

      // Trigger production evaluation
      console.log(`[GitHub Push Webhook] Triggering NEW evaluation for ${config.id}`);
      const triggerResult = await triggerProductionEvaluation(config, headSha);

      if (triggerResult.success) {
        results.triggered++;
      } else {
        results.errors.push(`${file.filename}: ${triggerResult.error}`);
      }
    }

    console.log(`[GitHub Push Webhook] Summary: ${results.triggered} triggered, ${results.skipped} skipped, ${results.errors.length} errors`);

    return NextResponse.json({
      message: 'Push processed',
      blueprints: blueprintFiles.length,
      results,
    }, { status: 200 });

  } catch (error: any) {
    console.error('[GitHub Push Webhook] Error processing push:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
