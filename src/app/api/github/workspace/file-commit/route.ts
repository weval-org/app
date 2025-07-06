import { getAccessToken } from '@/lib/github/auth-utils';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const accessToken = await getAccessToken(req);
    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const forkName = searchParams.get('forkName');
    const path = searchParams.get('path');

    if (!forkName || !path) {
        return NextResponse.json({ error: 'Missing forkName or path' }, { status: 400 });
    }
    
    try {
        const { Octokit } = await import('@octokit/rest');
        const octokit = new Octokit({ auth: accessToken });
        const [owner, repo] = forkName.split('/');
        
        const commits = await octokit.repos.listCommits({
            owner,
            repo,
            path,
            per_page: 1,
        });

        if (commits.data.length === 0) {
            // If no commits, it might be a new file not yet committed.
            // Return current date as a fallback.
            return NextResponse.json({ date: new Date().toISOString() });
        }

        const lastCommitDate = commits.data[0].commit.author?.date;

        return NextResponse.json({ date: lastCommitDate });

    } catch (error: any) {
        console.error('GitHub API error fetching file commit:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch file commit data from GitHub' }, { status: 500 });
    }
} 