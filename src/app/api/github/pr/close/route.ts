import { NextRequest, NextResponse } from 'next/server';
import { getOctokit } from '@/lib/github/github-utils';

export async function POST(req: NextRequest) {
    const octokit = await getOctokit(req);
    if (!octokit) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const { prNumber } = await req.json();

        if (!prNumber) {
            return NextResponse.json(
                { error: 'Pull request number (prNumber) is required' },
                { status: 400 },
            );
        }

        const response = await octokit.pulls.update({
            owner: 'weval-org',
            repo: 'configs',
            pull_number: prNumber,
            state: 'closed',
        });

        return NextResponse.json(response.data);

    } catch (error: any) {
        console.error('Failed to close PR:', error);
        // Provide more specific error feedback if possible
        if (error.status === 404) {
            return NextResponse.json({ error: 'Pull request not found.' }, { status: 404 });
        }
        return NextResponse.json({ error: error.message || 'Failed to close pull request' }, { status: 500 });
    }
} 