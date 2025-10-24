import { NextRequest, NextResponse } from 'next/server';
import { getOctokit } from '@/lib/github/github-utils';

interface BlueprintFile {
    name: string;
    path: string;
    sha: string;
    isLocal: boolean;
    lastModified: string;
    branchName: string;
}

export async function GET(req: NextRequest) {
    const octokit = await getOctokit(req);
    if (!octokit) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const forkName = req.nextUrl.searchParams.get('forkName');
        if (!forkName) {
            return NextResponse.json({ error: 'forkName parameter is required' }, { status: 400 });
        }
        
        const [owner, repo] = forkName.split('/');
        if (!owner || !repo) {
             return NextResponse.json({ error: 'Invalid forkName format. Expected owner/repo.' }, { status: 400 });
        }

        // 1. Get all branches
        const allBranches = await octokit.paginate(octokit.repos.listBranches, {
            owner,
            repo,
        });

        const proposalBranches = allBranches
            .filter(branch => branch.name.startsWith('proposal/'))
            .map(branch => branch.name);

        console.log('[GitHub API] 🔍 Found branches:', {
            total: allBranches.length,
            main: allBranches.some(b => b.name === 'main') ? 'yes' : 'no',
            proposalCount: proposalBranches.length,
            proposalBranches: proposalBranches
        });

        const branchesToScan = ['main', ...proposalBranches];
        const blueprintFileMap = new Map<string, BlueprintFile>();

        // 2. Get files from each branch
        for (const branchName of branchesToScan) {
            try {
                const workspacePath = `blueprints/users/${owner}`;
                const { data: contents } = await octokit.repos.getContent({
                    owner,
                    repo,
                    path: workspacePath,
                    ref: branchName,
                });

                if (Array.isArray(contents)) {
                    const filesInBranch: string[] = [];
                    for (const item of contents) {
                        if (item.type === 'file' && (item.name.endsWith('.yml') || item.name.endsWith('.yaml'))) {
                            filesInBranch.push(item.name);

                            // If we already have this file from a proposal branch, don't overwrite it with the one from main
                            if (blueprintFileMap.has(item.path) && branchName === 'main') {
                                console.log(`[GitHub API] ⏭️  Skipping ${item.name} from main (already have from proposal branch)`);
                                continue;
                            }

                            blueprintFileMap.set(item.path, {
                                name: item.name,
                                path: item.path,
                                sha: item.sha,
                                isLocal: false,
                                lastModified: new Date().toISOString(), // Placeholder
                                branchName: branchName,
                            });
                        }
                    }
                    if (filesInBranch.length > 0) {
                        console.log(`[GitHub API] 📄 Branch '${branchName}' contains:`, filesInBranch);
                    }
                }
            } catch (error: any) {
                // A 404 here is not a critical error, it just means the directory doesn't exist on this branch.
                if (error.status !== 404) {
                    console.warn(`Could not fetch contents for branch '${branchName}':`, error.message);
                }
            }
        }

        const allFiles = Array.from(blueprintFileMap.values());

        console.log('[GitHub API] 📦 Returning files:', {
            totalFiles: allFiles.length,
            groupedByName: allFiles.reduce((acc, f) => {
                acc[f.name] = (acc[f.name] || 0) + 1;
                return acc;
            }, {} as Record<string, number>)
        });

        return NextResponse.json(allFiles);

    } catch (error: any) {
        console.error('List workspace files failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}