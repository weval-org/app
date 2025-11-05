/**
 * GitHub Authentication Helper
 *
 * Supports two authentication methods:
 * 1. GitHub App (recommended for production)
 * 2. Personal Access Token (fallback for local development)
 *
 * Environment Variables:
 * - GITHUB_APP_ID: GitHub App ID
 * - GITHUB_APP_PRIVATE_KEY: GitHub App private key (single-line with \n)
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
 * Create an authenticated Octokit instance
 *
 * Tries GitHub App first, falls back to PAT if App credentials not available
 */
export async function getAuthenticatedOctokit(config?: GitHubAuthConfig): Promise<Octokit> {
  const appId = config?.appId || process.env.GITHUB_APP_ID;
  const privateKey = config?.privateKey || process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = config?.installationId || process.env.GITHUB_APP_INSTALLATION_ID;
  const token = config?.token || process.env.GITHUB_TOKEN;

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
    process.env.GITHUB_APP_PRIVATE_KEY &&
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
    console.log(`  Private Key: ${process.env.GITHUB_APP_PRIVATE_KEY ? '✓ Set' : '✗ Missing'}`);
  } else if (method === 'pat') {
    const tokenLength = process.env.GITHUB_TOKEN?.length || 0;
    console.log(`  Token: ${tokenLength} characters`);
  } else {
    console.log('  ⚠️  No credentials configured');
  }
}
