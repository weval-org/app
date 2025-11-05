/**
 * GitHub Authentication Helper
 *
 * Supports two authentication methods:
 * 1. GitHub App (recommended for production)
 * 2. Personal Access Token (fallback for local development)
 *
 * Environment Variables:
 * - GITHUB_APP_ID: GitHub App ID
 * - GITHUB_APP_PRIVATE_KEY: GitHub App private key (single-line with \n) OR secret name
 * - GITHUB_APP_PRIVATE_KEY_SECRET_NAME: AWS Secrets Manager secret name (alternative to inline key)
 * - GITHUB_APP_INSTALLATION_ID: Installation ID for the target org/repo
 * - GITHUB_TOKEN: Personal Access Token (fallback)
 */

import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';

export interface GitHubAuthConfig {
  // GitHub App credentials
  appId?: string;
  privateKey?: string;
  installationId?: string;

  // PAT fallback
  token?: string;
}

/**
 * Fetch GitHub App private key from AWS Secrets Manager
 */
async function getPrivateKeyFromSecretsManager(secretName: string): Promise<string> {
  try {
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');

    const client = new SecretsManagerClient({
      region: process.env.APP_S3_REGION || process.env.AWS_REGION || 'us-east-1',
      credentials: process.env.APP_AWS_ACCESS_KEY_ID ? {
        accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
      } : undefined,
    });

    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secretName,
      })
    );

    if (response.SecretString) {
      // Secret can be plain text or JSON
      try {
        const parsed = JSON.parse(response.SecretString);
        return parsed.privateKey || parsed.private_key || response.SecretString;
      } catch {
        return response.SecretString;
      }
    }

    throw new Error('Secret value is empty');
  } catch (error: any) {
    console.error('[GitHub Auth] Failed to fetch private key from Secrets Manager:', error.message);
    throw error;
  }
}

/**
 * Get GitHub App private key from environment or Secrets Manager
 */
async function getPrivateKey(configKey?: string): Promise<string | undefined> {
  // Use provided config key if available
  if (configKey) {
    return configKey;
  }

  // Check for secret name (preferred for production)
  const secretName = process.env.GITHUB_APP_PRIVATE_KEY_SECRET_NAME;
  if (secretName) {
    console.log(`[GitHub Auth] Fetching private key from AWS Secrets Manager: ${secretName}`);
    return await getPrivateKeyFromSecretsManager(secretName);
  }

  // Fall back to inline environment variable
  return process.env.GITHUB_APP_PRIVATE_KEY;
}

/**
 * Create an authenticated Octokit instance
 *
 * Tries GitHub App first, falls back to PAT if App credentials not available
 */
export async function getAuthenticatedOctokit(config?: GitHubAuthConfig): Promise<Octokit> {
  const appId = config?.appId || process.env.GITHUB_APP_ID;
  const installationId = config?.installationId || process.env.GITHUB_APP_INSTALLATION_ID;
  const token = config?.token || process.env.GITHUB_TOKEN;

  // Fetch private key (from config, Secrets Manager, or env)
  const privateKey = await getPrivateKey(config?.privateKey);

  // Try GitHub App authentication first (recommended)
  if (appId && privateKey && installationId) {
    try {
      console.log('[GitHub Auth] Using GitHub App authentication');

      const app = new App({
        appId: appId,
        privateKey: privateKey,
      });

      const octokit = await app.getInstallationOctokit(parseInt(installationId));

      console.log('[GitHub Auth] ✅ Successfully authenticated as GitHub App');
      return octokit as unknown as Octokit;

    } catch (error: any) {
      console.error('[GitHub Auth] ❌ GitHub App authentication failed:', error.message);
      console.error('[GitHub Auth] Falling back to Personal Access Token...');
    }
  }

  // Fallback to Personal Access Token
  if (token) {
    console.log('[GitHub Auth] Using Personal Access Token authentication');
    return new Octokit({ auth: token });
  }

  // No valid credentials
  throw new Error(
    'No GitHub credentials configured. Please set either:\n' +
    '  - GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID (recommended)\n' +
    '  - GITHUB_TOKEN (fallback for local development)'
  );
}

/**
 * Check which authentication method is being used
 */
export function getAuthMethod(): 'github-app' | 'pat' | 'none' {
  const hasAppCreds = !!(
    process.env.GITHUB_APP_ID &&
    (process.env.GITHUB_APP_PRIVATE_KEY || process.env.GITHUB_APP_PRIVATE_KEY_SECRET_NAME) &&
    process.env.GITHUB_APP_INSTALLATION_ID
  );

  if (hasAppCreds) return 'github-app';
  if (process.env.GITHUB_TOKEN) return 'pat';
  return 'none';
}

/**
 * Log current auth configuration (safe - doesn't expose secrets)
 */
export function logAuthConfig(): void {
  const method = getAuthMethod();

  console.log('[GitHub Auth] Configuration:');
  console.log(`  Method: ${method}`);

  if (method === 'github-app') {
    console.log(`  App ID: ${process.env.GITHUB_APP_ID}`);
    console.log(`  Installation ID: ${process.env.GITHUB_APP_INSTALLATION_ID}`);

    if (process.env.GITHUB_APP_PRIVATE_KEY_SECRET_NAME) {
      console.log(`  Private Key: ✓ AWS Secrets Manager (${process.env.GITHUB_APP_PRIVATE_KEY_SECRET_NAME})`);
    } else if (process.env.GITHUB_APP_PRIVATE_KEY) {
      console.log(`  Private Key: ✓ Environment Variable`);
    } else {
      console.log(`  Private Key: ✗ Missing`);
    }
  } else if (method === 'pat') {
    const tokenLength = process.env.GITHUB_TOKEN?.length || 0;
    console.log(`  Token: ${tokenLength} characters`);
  } else {
    console.log('  ⚠️  No credentials configured');
  }
}
