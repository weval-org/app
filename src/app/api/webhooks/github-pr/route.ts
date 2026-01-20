import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { Octokit } from '@octokit/rest';
import { getAuthenticatedOctokit } from '@/lib/github-auth';
import { callBackgroundFunction } from '@/lib/background-function-client';
import { prEvaluationLimiter, webhookIPLimiter, webhookGlobalLimiter } from '@/lib/webhook-rate-limiter';
import { checkPREvalLimits, formatLimitViolations, PR_EVAL_LIMITS } from '@/lib/pr-eval-limiter';
import { validateReservedPrefixes } from '@/lib/blueprint-parser';
import { generateBlueprintIdFromPath, validateBlueprintId } from '@/app/utils/blueprintIdUtils';

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const UPSTREAM_OWNER = 'weval-org';
const UPSTREAM_REPO = 'configs';
const MAX_BLUEPRINTS_PER_PR = 3;
const MAX_BLUEPRINT_SIZE_KB = 500; // 500KB max

interface BlueprintFile {
  filename: string;
  username: string;
  blueprintName: string;
  sha: string;
  status: string; // added, modified, removed
  content?: string;
}

/**
 * Verify GitHub webhook signature
 */
function verifyWebhookSignature(payload: string, signature: string | null): boolean {
  if (!GITHUB_WEBHOOK_SECRET || !signature) {
    console.warn('[GitHub Webhook] Missing webhook secret or signature');
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
 * Parse blueprint files from PR changes
 * Only includes files in blueprints/users/{username}/ directory
 */
function parseBlueprintFiles(files: any[], prAuthor: string): {
  valid: BlueprintFile[];
  invalid: Array<{ filename: string; reason: string }>;
} {
  const valid: BlueprintFile[] = [];
  const invalid: Array<{ filename: string; reason: string }> = [];

  for (const file of files) {
    const filename = file.filename;

    // Only process .yml and .yaml files in blueprints/users/ directory
    if (!filename.startsWith('blueprints/users/')) {
      continue; // Silently skip files outside users directory
    }

    // Reject path traversal attempts
    if (filename.includes('../') || filename.includes('./')) {
      invalid.push({ filename, reason: 'Path traversal not allowed' });
      continue;
    }

    if (!filename.endsWith('.yml') && !filename.endsWith('.yaml')) {
      invalid.push({ filename, reason: 'Not a YAML file' });
      continue;
    }

    // Parse: blueprints/users/{username}/{blueprint-name}.yml
    const match = filename.match(/^blueprints\/users\/([^\/]+)\/(.+\.ya?ml)$/);
    if (!match) {
      invalid.push({ filename, reason: 'Invalid path structure. Must be blueprints/users/{username}/{name}.yml' });
      continue;
    }

    const [, username, blueprintName] = match;

    // CRITICAL: Validate username matches PR author
    if (username !== prAuthor) {
      invalid.push({
        filename,
        reason: `Username mismatch: directory is '${username}' but PR author is '${prAuthor}'`
      });
      continue;
    }

    // Validate blueprint ID doesn't use reserved prefixes or patterns
    try {
      const pathForId = filename.startsWith('blueprints/')
        ? filename.substring('blueprints/'.length)
        : filename;
      const generatedId = generateBlueprintIdFromPath(pathForId);
      validateReservedPrefixes(generatedId);
      validateBlueprintId(generatedId);
    } catch (error: any) {
      invalid.push({
        filename,
        reason: error.message || 'Blueprint ID validation failed'
      });
      continue;
    }

    // Skip removed files
    if (file.status === 'removed') {
      continue;
    }

    valid.push({
      filename,
      username,
      blueprintName,
      sha: file.sha,
      status: file.status,
    });
  }

  return { valid, invalid };
}

/**
 * Fetch blueprint content from GitHub
 */
async function fetchBlueprintContent(octokit: Octokit, owner: string, repo: string, ref: string, path: string): Promise<string | null> {
  try {
    const response = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if ('content' in response.data && response.data.type === 'file') {
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');

      // Check size limit
      const sizeKB = Buffer.byteLength(content, 'utf-8') / 1024;
      if (sizeKB > MAX_BLUEPRINT_SIZE_KB) {
        throw new Error(`Blueprint exceeds size limit (${sizeKB.toFixed(1)}KB > ${MAX_BLUEPRINT_SIZE_KB}KB)`);
      }

      return content;
    }
    return null;
  } catch (error: any) {
    console.error(`[GitHub Webhook] Failed to fetch content for ${path}:`, error.message);
    return null;
  }
}

/**
 * Validate blueprint YAML syntax
 *
 * Supports all valid blueprint structures:
 * - Structure 1: Header + prompts (two documents separated by ---)
 * - Structure 2: Stream of prompt documents (multiple docs separated by ---)
 * - Structure 3: Single document with prompts array
 * - Structure 4: List of prompts only
 */
async function validateBlueprint(content: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const yaml = await import('js-yaml');
    // Use loadAll to support multi-document YAML (separated by ---)
    const docs = yaml.loadAll(content).filter(doc => doc !== null && doc !== undefined);

    if (docs.length === 0) {
      return { valid: false, error: 'Blueprint file is empty' };
    }

    // Structure 1: Header + prompts array in second doc
    if (docs.length > 1 && typeof docs[0] === 'object' && !Array.isArray(docs[0]) && Array.isArray(docs[1])) {
      return { valid: true };
    }

    // Structure 2: Stream of prompt documents (all objects)
    if (docs.every(doc => typeof doc === 'object' && !Array.isArray(doc))) {
      return { valid: true };
    }

    // Structure 3: Single doc with prompts key
    if (docs.length === 1 && typeof docs[0] === 'object' && !Array.isArray(docs[0])) {
      const config = docs[0] as any;
      if (config.prompts && Array.isArray(config.prompts)) {
        return { valid: true };
      }
    }

    // Structure 4: Single doc that is a list of prompts
    if (docs.length === 1 && Array.isArray(docs[0])) {
      return { valid: true };
    }

    return { valid: false, error: 'Blueprint must be in one of the supported formats (see docs)' };
  } catch (error: any) {
    return { valid: false, error: `YAML parse error: ${error.message}` };
  }
}

/**
 * Post comment to PR
 */
async function postPRComment(octokit: Octokit, prNumber: number, body: string): Promise<void> {
  try {
    await octokit.issues.createComment({
      owner: UPSTREAM_OWNER,
      repo: UPSTREAM_REPO,
      issue_number: prNumber,
      body,
    });
    console.log(`[GitHub Webhook] Posted comment to PR #${prNumber}`);
  } catch (error: any) {
    console.error(`[GitHub Webhook] Failed to post comment:`, error.message);
    throw error;
  }
}

/**
 * Trigger evaluation for a blueprint
 */
async function triggerEvaluation(
  prNumber: number,
  blueprintFile: BlueprintFile,
  blueprintContent: string,
  commitSha: string
): Promise<{ success: boolean; runId?: string; error?: string }> {
  try {
    const runId = `pr-${prNumber}-${blueprintFile.username}-${Date.now()}`;

    const response = await callBackgroundFunction({
      functionName: 'execute-pr-evaluation-background',
      body: {
        runId,
        prNumber,
        blueprintPath: blueprintFile.filename,
        blueprintContent,
        commitSha,
        author: blueprintFile.username,
      },
      timeout: 10000,
    });

    if (response.ok) {
      return { success: true, runId };
    } else {
      return { success: false, error: response.error || 'Unknown error' };
    }
  } catch (error: any) {
    console.error('[GitHub Webhook] Failed to trigger evaluation:', error.message);
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
    console.warn('[GitHub Webhook] Global rate limit exceeded');
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
    console.warn(`[GitHub Webhook] Rate limit exceeded for IP: ${ip}`);
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
    console.error('[GitHub Webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Only handle pull_request events
  if (event !== 'pull_request') {
    return NextResponse.json({ message: 'Event ignored' }, { status: 200 });
  }

  const payload = JSON.parse(rawBody);
  const action = payload.action;

  // Only handle opened, synchronize (new commits), and reopened
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return NextResponse.json({ message: 'Action ignored' }, { status: 200 });
  }

  const pr = payload.pull_request;
  const prNumber = pr.number;
  const prAuthor = pr.user.login;
  const headSha = pr.head.sha;
  const headRef = pr.head.ref;
  const headRepo = pr.head.repo.full_name;

  console.log(`[GitHub Webhook] PR #${prNumber} ${action} by ${prAuthor} (${headSha})`);

  // Check user rate limit
  const userLimit = prEvaluationLimiter.check(prAuthor);
  if (!userLimit.allowed) {
    console.warn(`[GitHub Webhook] Rate limit exceeded for user: ${prAuthor}`);
    try {
      const octokit = await getAuthenticatedOctokit();
      await postPRComment(
        octokit,
        prNumber,
        `⚠️ **Rate limit exceeded**\n\n` +
        `@${prAuthor}, you have exceeded the maximum number of PR evaluations per hour.\n\n` +
        `Please wait ${userLimit.retryAfter} seconds before triggering another evaluation.`
      );
    } catch (authError: any) {
      console.error('[GitHub Webhook] Failed to post rate limit comment:', authError.message);
    }
    return NextResponse.json(
      { error: 'Rate limit exceeded for user', retryAfter: userLimit.retryAfter },
      {
        status: 429,
        headers: { 'Retry-After': String(userLimit.retryAfter) }
      }
    );
  }

  let octokit;
  try {
    octokit = await getAuthenticatedOctokit();
  } catch (authError: any) {
    console.error('[GitHub Webhook] GitHub authentication failed:', authError.message);
    return NextResponse.json({ error: 'GitHub authentication failed' }, { status: 500 });
  }

  try {
    // Fetch PR files
    const filesResponse = await octokit.pulls.listFiles({
      owner: UPSTREAM_OWNER,
      repo: UPSTREAM_REPO,
      pull_number: prNumber,
      per_page: 100,
    });

    const { valid, invalid } = parseBlueprintFiles(filesResponse.data, prAuthor);

    // Check max blueprints limit
    if (valid.length > MAX_BLUEPRINTS_PER_PR) {
      await postPRComment(
        octokit,
        prNumber,
        `❌ **Too many blueprints in this PR**\n\n` +
        `This PR contains ${valid.length} blueprints, but the maximum is ${MAX_BLUEPRINTS_PER_PR}.\n\n` +
        `Please split your changes into multiple PRs.`
      );
      return NextResponse.json({
        message: 'Too many blueprints',
        count: valid.length,
        max: MAX_BLUEPRINTS_PER_PR
      }, { status: 400 });
    }

    // If no valid blueprints, check if there were invalid ones
    if (valid.length === 0) {
      if (invalid.length > 0) {
        const errorList = invalid.map(f => `- \`${f.filename}\`: ${f.reason}`).join('\n');
        await postPRComment(
          octokit,
          prNumber,
          `❌ **Blueprint validation failed**\n\n${errorList}\n\n` +
          `Blueprints must be in \`blueprints/users/${prAuthor}/\` directory and match your GitHub username.`
        );
      }
      // No valid blueprints, nothing to do
      return NextResponse.json({ message: 'No valid blueprints to evaluate' }, { status: 200 });
    }

    // Fetch and validate blueprint content
    const blueprintsToEvaluate: Array<{
      file: BlueprintFile;
      content: string;
      limitInfo?: { exceeded: boolean; violations: any[]; estimatedResponses: number };
    }> = [];

    const validationErrors: Array<{ filename: string; error: string }> = [];

    for (const file of valid) {
      // Fetch content from PR head
      const content = await fetchBlueprintContent(
        octokit,
        pr.head.repo.owner.login,
        pr.head.repo.name,
        headSha,
        file.filename
      );

      if (!content) {
        validationErrors.push({ filename: file.filename, error: 'Failed to fetch blueprint content' });
        continue;
      }

      // Validate YAML
      const validation = await validateBlueprint(content);
      if (!validation.valid) {
        validationErrors.push({ filename: file.filename, error: validation.error || 'Validation failed' });
        continue;
      }

      // Parse blueprint for limit checking using the proper parser
      // This handles all multi-document formats correctly
      const { parseAndNormalizeBlueprint } = await import('@/lib/blueprint-parser');
      const config = parseAndNormalizeBlueprint(content, 'yaml');

      // Check PR evaluation limits
      // Note: checkPREvalLimits doesn't need auth for public model collections
      const limitCheck = await checkPREvalLimits(config);

      if (!limitCheck.allowed) {
        // Blueprint exceeds limits - we'll trim it and run the trimmed version
        console.log(`[GitHub Webhook] Blueprint ${file.filename} exceeds limits. Will trim and run limited version.`);

        // Store limit info to include in status comment
        blueprintsToEvaluate.push({
          file,
          content,
          limitInfo: {
            exceeded: true,
            violations: limitCheck.violations,
            estimatedResponses: limitCheck.estimatedResponses,
          }
        });
      } else {
        console.log(`[GitHub Webhook] Blueprint ${file.filename} within limits: ~${limitCheck.estimatedResponses} responses`);
        blueprintsToEvaluate.push({
          file,
          content,
          limitInfo: {
            exceeded: false,
            violations: [],
            estimatedResponses: limitCheck.estimatedResponses,
          }
        });
      }
    }

    // If all blueprints failed validation
    if (blueprintsToEvaluate.length === 0 && validationErrors.length > 0) {
      const errorList = validationErrors.map(e => `- \`${e.filename}\`: ${e.error}`).join('\n');
      await postPRComment(
        octokit,
        prNumber,
        `❌ **Blueprint validation failed**\n\n${errorList}`
      );
      return NextResponse.json({ message: 'All blueprints failed validation', errors: validationErrors }, { status: 400 });
    }

    // Trigger evaluations
    const results = await Promise.all(
      blueprintsToEvaluate.map(({ file, content }) =>
        triggerEvaluation(prNumber, file, content, headSha)
      )
    );

    // Build status comment
    const statusLines = blueprintsToEvaluate.map(({ file, limitInfo }, index) => {
      const result = results[index];
      const statusUrl = `https://weval.org/pr-eval/${prNumber}/${encodeURIComponent(file.filename)}`;

      if (result.success) {
        let line = `- ✅ \`${file.filename}\` - [View Status](${statusUrl})`;

        // Add note if blueprint was trimmed
        if (limitInfo?.exceeded) {
          line += `\n  ⚠️ _Blueprint trimmed to fit PR evaluation limits (full evaluation runs after merge)_`;
        }

        return line;
      } else {
        return `- ❌ \`${file.filename}\` - Failed to start: ${result.error}`;
      }
    });

    // Add explanation if any blueprints were trimmed
    const trimmedCount = blueprintsToEvaluate.filter(b => b.limitInfo?.exceeded).length;
    let explanation = '';

    if (trimmedCount > 0) {
      explanation = `\n**Note:** ${trimmedCount} blueprint${trimmedCount > 1 ? 's' : ''} exceeded PR evaluation limits and ${trimmedCount > 1 ? 'were' : 'was'} automatically trimmed:\n`;
      explanation += `- Limited to ${PR_EVAL_LIMITS.maxPrompts} prompts, ${PR_EVAL_LIMITS.maxModels} models (${PR_EVAL_LIMITS.allowedModelCollections.join(', ')}), ${PR_EVAL_LIMITS.maxTemperatures} temps, ${PR_EVAL_LIMITS.maxSystemPrompts} systems\n`;
      explanation += `- Full evaluation with all prompts/models will run automatically after merge\n`;
    }

    const commentBody =
      `⚡ **Evaluation started!**\n\n` +
      `${statusLines.join('\n')}\n` +
      explanation +
      `\nResults will be posted here when complete.\n\n` +
      `---\n` +
      `*Commit: ${headSha.substring(0, 7)}*`;

    await postPRComment(octokit, prNumber, commentBody);

    return NextResponse.json({
      message: 'Evaluations triggered',
      blueprints: blueprintsToEvaluate.length,
      results
    }, { status: 200 });

  } catch (error: any) {
    console.error('[GitHub Webhook] Error processing PR:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
