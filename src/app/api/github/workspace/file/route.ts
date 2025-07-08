import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/github/auth-utils';
import { Buffer } from 'buffer';

// This is a server-side-only type definition
interface BlueprintFile {
    name: string;
    path: string;
    sha: string;
    isLocal: boolean;
    lastModified: string;
}

async function githubApiRequest(endpoint: string, token: string, options: RequestInit = {}) {
    const response = await fetch(`https://api.github.com${endpoint}`, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
        },
    });
    return response;
}

export async function GET(req: NextRequest) {
    const accessToken = await getAccessToken(req);
    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const path = req.nextUrl.searchParams.get('path');
        const forkName = req.nextUrl.searchParams.get('forkName');

        if (!path || !forkName) {
            return NextResponse.json({ error: 'File path and fork name are required' }, { status: 400 });
        }
        
        const userResponse = await githubApiRequest('/user', accessToken);
        if (!userResponse.ok) throw new Error('Failed to fetch user data');
        const user = await userResponse.json();
        const userLogin = user.login;

        const fileResponse = await githubApiRequest(`/repos/${forkName}/contents/${path}`, accessToken);

        if (!fileResponse.ok) {
            const errorBody = await fileResponse.json();
            throw new Error(`Failed to get file content: ${errorBody.message}`);
        }

        const fileData = await fileResponse.json();
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
    const accessToken = await getAccessToken(req);
    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { path, content, sha, forkName, isNew } = await req.json();
    if (!path || content === undefined || !forkName) {
        return NextResponse.json({ error: 'File path, content, and fork name are required' }, { status: 400 });
    }

    try {
        const body: { message: string; content: string; sha?: string } = {
            message: isNew 
                ? `feat(blueprints): create ${path}`
                : `feat(blueprints): update ${path}`,
            content: Buffer.from(content).toString('base64'),
        };
        
        // For updates, the SHA of the file being updated is required.
        // For new files, it must be omitted.
        if (sha) {
            body.sha = sha;
        }

        const response = await githubApiRequest(
            `/repos/${forkName}/contents/${path}`,
            accessToken,
            {
                method: 'PUT',
                body: JSON.stringify(body),
            }
        );

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`Failed to save file to GitHub: ${errorBody.message}`);
        }

        const data = await response.json();
        const createdFile = data.content;

        return NextResponse.json({
            name: createdFile.name,
            path: createdFile.path,
            sha: createdFile.sha,
            isLocal: false,
            lastModified: data.commit.committer.date,
        });

    } catch (error: any) {
        console.error('Save file failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const accessToken = await getAccessToken(req);
    if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { path, sha, forkName } = await req.json();

        if (!path || !sha || !forkName) {
            return NextResponse.json({ error: 'Missing required parameters: path, sha, forkName' }, { status: 400 });
        }

        const { Octokit } = await import('@octokit/rest');
        const octokit = new Octokit({ auth: accessToken });

        await octokit.repos.deleteFile({
            owner: forkName.split('/')[0],
            repo: forkName.split('/')[1],
            path,
            message: `feat: delete blueprint '${path}'`,
            sha,
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('DELETE /api/github/workspace/file error:', error);
        return NextResponse.json({ error: 'Failed to delete file from GitHub' }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const accessToken = await getAccessToken(req);
    if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { oldPath, newName, forkName } = await req.json();

        if (!oldPath || !newName || !forkName) {
            return NextResponse.json({ error: 'Missing required parameters: oldPath, newName, forkName' }, { status: 400 });
        }
        
        const { Octokit } = await import('@octokit/rest');
        const octokit = new Octokit({ auth: accessToken });
        const [owner, repo] = forkName.split('/');

        // 1. Get the content of the old file
        const { data: oldFileData } = await octokit.repos.getContent({
            owner,
            repo,
            path: oldPath,
        });

        if (!('content' in oldFileData) || !('sha' in oldFileData)) {
            throw new Error('Could not retrieve content of the original file.');
        }

        const newPath = oldPath.substring(0, oldPath.lastIndexOf('/') + 1) + newName;
        
        // 2. Create the new file with the same content
        const { data: newFileResult } = await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: newPath,
            message: `feat: rename '${oldPath}' to '${newPath}'`,
            content: oldFileData.content,
        });

        // 3. Delete the old file
        await octokit.repos.deleteFile({
            owner,
            repo,
            path: oldPath,
            message: `feat: remove old file after rename to '${newPath}'`,
            sha: oldFileData.sha,
        });

        if (!newFileResult.content || !newFileResult.content.sha) {
            throw new Error('New file content or SHA was not returned from GitHub API.');
        }

        // 4. Return the new file data in the format our frontend expects
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