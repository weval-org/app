import { NextRequest, NextResponse } from 'next/server';
import { getOctokit } from '@/lib/github/github-utils';
import { getAccessToken } from '@/lib/github/auth-utils';

const UPSTREAM_OWNER = 'weval-org';
const UPSTREAM_REPO = 'configs';

export async function POST(req: NextRequest) {
    const octokit = await getOctokit(req);
    const accessToken = await getAccessToken(req);
    
    if (!octokit || !accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const { forkName, title, body, blueprintPath, blueprintContent } = await req.json();

        if (!forkName || !title || !body || !blueprintPath || !blueprintContent) {
            return NextResponse.json(
                { error: 'forkName, title, body, blueprintPath, and blueprintContent are required' },
                { status: 400 },
            );
        }

        const userResponse = await octokit.users.getAuthenticated();
        const userLogin = userResponse.data.login;
        
        const [forkOwner, forkRepoName] = forkName.split('/');

        const { data: mainBranch } = await octokit.git.getRef({
            owner: UPSTREAM_OWNER,
            repo: UPSTREAM_REPO,
            ref: 'heads/main',
        });
        const latestSha = mainBranch.object.sha;

        const branchName = `proposal/${blueprintPath.split('/').pop()?.replace('.yml', '')}-${Date.now()}`;
        await octokit.git.createRef({
            owner: forkOwner,
            repo: forkRepoName,
            ref: `refs/heads/${branchName}`,
            sha: latestSha,
        });

        let fileSha: string | undefined;
        try {
            const { data: existingFile } = await octokit.repos.getContent({
                owner: forkOwner,
                repo: forkRepoName,
                path: blueprintPath,
                ref: branchName,
            });
            if (!Array.isArray(existingFile)) {
                fileSha = existingFile.sha;
            }
        } catch (error) {
            // File doesn't exist, which is fine.
        }

        await octokit.repos.createOrUpdateFileContents({
            owner: forkOwner,
            repo: forkRepoName,
            path: blueprintPath,
            message: `feat(blueprints): Add or update ${blueprintPath}`,
            content: Buffer.from(blueprintContent).toString('base64'),
            branch: branchName,
            sha: fileSha,
        });

        const prData = {
            title,
            body,
            head: `${userLogin}:${branchName}`,
            base: 'main',
        };

        const response = await octokit.pulls.create({
            owner: UPSTREAM_OWNER,
            repo: UPSTREAM_REPO,
            ...prData,
        });

        return NextResponse.json(response.data);

    } catch (error: any) {
        console.error('Create PR failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
} 