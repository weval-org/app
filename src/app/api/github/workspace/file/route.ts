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

    const path = req.nextUrl.searchParams.get('path');
    const forkName = req.nextUrl.searchParams.get('forkName');
    const branchName = req.nextUrl.searchParams.get('branchName');

    try {

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
        console.error('[GitHub API] Get file content failed:', {
            path,
            branchName,
            error: error.message,
        });

        let userMessage = error.message;
        if (error.message?.includes('404')) {
            userMessage = `File not found at "${path}". It may have been deleted or moved.`;
        } else if (error.message?.includes('403')) {
            userMessage = 'Access denied. You may not have permission to read this file.';
        }

        return NextResponse.json({
            error: userMessage,
            errorId: `ERR_GITHUB_FILE_LOAD_${Date.now()}`,
            technicalDetails: {
                operation: 'load_file',
                path,
                branchName: branchName || 'default',
                originalError: error.message,
            }
        }, { status: 500 });
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
            // Step 1: Get upstream's main branch SHA
            const upstreamMain = await octokit.repos.getBranch({
                owner: upstreamOwner,
                repo: upstreamRepo,
                branch: 'main',
            });
            const upstreamSha = upstreamMain.data.commit.sha;

            // Step 2: Try to sync fork's main with upstream's main
            // This ensures the branch we create is based on the latest upstream code
            let syncedSha = upstreamSha;
            try {
                await octokit.git.updateRef({
                    owner,
                    repo,
                    ref: 'heads/main',
                    sha: upstreamSha,
                    force: false, // Only fast-forward, don't overwrite diverged changes
                });
                console.log(`[Workspace] Successfully synced ${owner}/${repo} main with upstream`);
            } catch (syncError: any) {
                // If sync fails (e.g., fork has diverged), use fork's current main instead
                console.warn(`[Workspace] Could not fast-forward sync fork's main (${syncError.message}). Using fork's current main.`);
                const forkMain = await octokit.repos.getBranch({
                    owner,
                    repo,
                    branch: 'main',
                });
                syncedSha = forkMain.data.commit.sha;
            }

            // Step 3: Create the new branch pointing to the synced SHA
            await octokit.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${branchName}`,
                sha: syncedSha,
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
        console.error('[GitHub API] Save file failed:', {
            path,
            branchName,
            isNew,
            error: error.message,
            stack: error.stack,
        });

        // Provide more specific error messages
        let userMessage = error.message;
        if (error.message?.includes('Reference already exists')) {
            userMessage = `Branch "${branchName}" already exists. Try refreshing the page or using a different filename.`;
        } else if (error.message?.includes('404')) {
            userMessage = 'Repository or branch not found. Please verify your GitHub setup.';
        } else if (error.message?.includes('401') || error.message?.includes('403')) {
            userMessage = 'GitHub authentication failed. Try logging out and logging back in.';
        }

        return NextResponse.json({
            error: userMessage,
            errorId: `ERR_GITHUB_FILE_SAVE_${Date.now()}`,
            technicalDetails: {
                operation: isNew ? 'create_file' : 'update_file',
                path,
                branchName,
                originalError: error.message,
            }
        }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const octokit = await getOctokit(req);
    if (!octokit) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let path: string | undefined;
    let branchName: string | undefined;

    try {
        const body = await req.json();
        path = body.path;
        const sha = body.sha;
        const forkName = body.forkName;
        branchName = body.branchName;

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
        console.error('[GitHub API] Delete file failed:', {
            path,
            branchName,
            error: error.message,
        });

        let userMessage = error.message || 'Failed to delete file from GitHub';
        if (error.message?.includes('404')) {
            userMessage = 'File not found. It may have already been deleted.';
        } else if (error.message?.includes('409')) {
            userMessage = 'Cannot delete file due to a conflict. The file may have been modified.';
        }

        return NextResponse.json({
            error: userMessage,
            errorId: `ERR_GITHUB_FILE_DELETE_${Date.now()}`,
            technicalDetails: {
                operation: 'delete_file',
                path,
                branchName,
                originalError: error.message,
            }
        }, { status: 500 });
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