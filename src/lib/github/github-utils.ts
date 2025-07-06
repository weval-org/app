import { NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/github/auth-utils';
import type { Octokit as OctokitType } from '@octokit/rest' with { 'resolution-mode': 'require' };

/**
 * Creates an authenticated Octokit instance for making GitHub API requests.
 * @param req - The NextRequest object to extract the user's session from.
 * @returns An authenticated Octokit instance, or null if the user is not authenticated.
 */
export async function getOctokit(req: NextRequest): Promise<OctokitType | null> {
    const accessToken = await getAccessToken(req);
    if (!accessToken) {
        return null;
    }
    // Dynamically import Octokit to support CommonJS/ESM interop
    const { Octokit } = await import('@octokit/rest');
    return new Octokit({ auth: accessToken });
} 