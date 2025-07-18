    import { NextRequest, NextResponse } from 'next/server';
import { Buffer } from 'buffer';
import { getOctokit } from '@/lib/github/github-utils';

// This is a server-side-only type definition
interface BlueprintFile {
    name: string;
    path: string;
    sha: string;
    isLocal: boolean;
    lastModified: string;
}

export async function GET(req: NextRequest) {
    const octokit = await getOctokit(req);
    if (!octokit) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const path = req.nextUrl.searchParams.get('path');
        const forkName = req.nextUrl.searchParams.get('forkName');
        const branchName = req.nextUrl.searchParams.get('branchName');

        if (!path || !forkName) {
            return NextResponse.json({ error: 'File path and fork name are required' }, { status: 400 });
        }
        
        const [owner, repo] = forkName.split('/');

        const fileResponse = await octokit.repos.getContent({
            owner,
            repo,
            path,
            ref: branchName || undefined,
        });

        if (Array.isArray(fileResponse.data)) {
            throw new Error('Expected a file, but got a directory listing.');
        }

        const fileData = fileResponse.data;
        if (fileData.type !== 'file' || !('content' in fileData)) {
             throw new Error('The path does not point to a file or content is missing.');
        }

        if (fileData.encoding !== 'base64') {
            throw new Error('Unexpected file encoding from GitHub');
        }
        
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');

        return NextResponse.json({ 
            content,
            sha: fileData.sha,
            path: fileData.path,
         });

    } catch (error: any) {
        console.error('Get file content failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const octokit = await getOctokit(req);
    if (!octokit) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { path, content, sha, forkName, isNew, branchName } = await req.json();
    if (!path || content === undefined || !forkName) {
        return NextResponse.json({ error: 'File path, content, and fork name are required' }, { status: 400 });
    }
    if (!branchName) {
        return NextResponse.json({ error: 'A branch name is required for all file operations.' }, { status: 400 });
    }

    try {
        const [owner, repo] = forkName.split('/');
        const upstreamOwner = 'weval-org';
        const upstreamRepo = 'configs';

        if (isNew) {
            // Get the SHA of the main branch from the UPSTREAM repo
            const mainBranch = await octokit.repos.getBranch({
                owner: upstreamOwner,
                repo: upstreamRepo,
                branch: 'main',
            });
            const mainSha = mainBranch.data.commit.sha;

            // Create the new branch on the user's FORK pointing to the upstream SHA
            await octokit.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${branchName}`,
                sha: mainSha,
            });
        }
        
        const { data: { commit, content: createdFile } } = await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message: isNew 
                ? `feat(blueprints): create ${path} on new branch`
                : `feat(blueprints): update ${path}`,
            content: Buffer.from(content).toString('base64'),
            sha: sha,
            branch: branchName,
        });

        if (!createdFile) {
            throw new Error('GitHub API did not return content after file creation/update.');
        }

        return NextResponse.json({
            name: createdFile.name,
            path: createdFile.path,
            sha: createdFile.sha,
            isLocal: false,
            lastModified: commit.committer?.date,
        });

    } catch (error: any) {
        console.error('Save file failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const octokit = await getOctokit(req);
    if (!octokit) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { path, sha, forkName, branchName } = await req.json();

        if (!path || !sha || !forkName || !branchName) {
            return NextResponse.json({ error: 'Missing required parameters: path, sha, forkName, branchName' }, { status: 400 });
        }

        const [owner, repo] = forkName.split('/');

        await octokit.repos.deleteFile({
            owner,
            repo,
            path,
            message: `feat: delete blueprint '${path}'`,
            sha,
            branch: branchName,
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('DELETE /api/github/workspace/file error:', error);
        return NextResponse.json({ error: 'Failed to delete file from GitHub' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const octokit = await getOctokit(req);
    if (!octokit) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { oldPath, newName, forkName, branchName } = await req.json();

        if (!oldPath || !newName || !forkName || !branchName) {
            return NextResponse.json({ error: 'Missing required parameters: oldPath, newName, forkName, branchName' }, { status: 400 });
        }
        
        const [owner, repo] = forkName.split('/');

        const { data: oldFileDataResponse } = await octokit.repos.getContent({
            owner,
            repo,
            path: oldPath,
            ref: branchName,
        });

        if (Array.isArray(oldFileDataResponse) || !('content' in oldFileDataResponse) || !('sha' in oldFileDataResponse)) {
            throw new Error('Could not retrieve content of the original file.');
        }
        const oldFileData = oldFileDataResponse;

        const newPath = oldPath.substring(0, oldPath.lastIndexOf('/') + 1) + newName;
        
        const { data: newFileResult } = await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: newPath,
            message: `feat: rename '${oldPath}' to '${newPath}'`,
            content: oldFileData.content,
            branch: branchName,
        });

        await octokit.repos.deleteFile({
            owner,
            repo,
            path: oldPath,
            message: `feat: remove old file after rename to '${newPath}'`,
            sha: oldFileData.sha,
            branch: branchName,
        });

        if (!newFileResult.content || !newFileResult.content.sha) {
            throw new Error('New file content or SHA was not returned from GitHub API.');
        }

        const newFile: BlueprintFile = {
            name: newName,
            path: newPath,
            sha: newFileResult.content.sha,
            isLocal: false,
            lastModified: new Date().toISOString(),
        };

        return NextResponse.json(newFile);

    } catch (error: any) {
        console.error('PATCH /api/github/workspace/file error:', error);
        return NextResponse.json({ error: `Failed to rename file on GitHub: ${error.message}` }, { status: 500 });
    }
}