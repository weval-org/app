import { NextRequest, NextResponse } from 'next/server';
import { getOctokit } from '@/lib/github/github-utils';

export async function GET(req: NextRequest) {
    const octokit = await getOctokit(req);
    if (!octokit) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const userResponse = await octokit.rest.users.getAuthenticated();
        const userLogin = userResponse.data.login;

        const searchResponse = await octokit.request('GET /search/issues', {
            q: `repo:weval-org/configs is:pr author:${userLogin}`,
            per_page: 100, // Assuming a user won't have more than 100 PRs
        });

        const prs = searchResponse.data.items;
        const prStatuses: Record<string, {
            number: number;
            state: string; // 'open', 'closed'
            merged: boolean;
            url: string;
            title: string;
        }> = {};

        for (const pr of prs) {
            const pullNumber = pr.number;
            const filesResponse = await octokit.pulls.listFiles({
                owner: 'weval-org',
                repo: 'configs',
                pull_number: pullNumber,
            });

            for (const file of filesResponse.data) {
                // The state for a closed PR can be 'closed' (rejected) or 'merged'.
                const isMerged = !!pr.pull_request?.merged_at;
                
                prStatuses[file.filename] = {
                    number: pr.number,
                    state: pr.state,
                    merged: isMerged,
                    url: pr.html_url,
                    title: pr.title,
                };
            }
        }

        return NextResponse.json(prStatuses);

    } catch (error: any) {
        console.error('Failed to fetch PR statuses:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
} 