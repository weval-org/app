import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/github/auth-utils';
import { Buffer } from 'buffer';

const UPSTREAM_OWNER = 'weval-org';
const UPSTREAM_REPO_NAME = 'configs';
const UPSTREAM_REPO_FULL_NAME = `${UPSTREAM_OWNER}/${UPSTREAM_REPO_NAME}`;
const DEFAULT_FORK_NAME = 'weval-configs';

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

// Helper to find an existing fork by listing the upstream repo's forks
async function findExistingFork(accessToken: string, userLogin: string): Promise<string | null> {
    console.log(`Searching for a fork of '${UPSTREAM_REPO_FULL_NAME}' owned by '${userLogin}'...`);
    
    // Note: This endpoint is paginated, but it's highly unlikely a user has >100 forks of the same repo.
    // For this use case, checking the first page is sufficient and more efficient.
    const url = `/repos/${UPSTREAM_REPO_FULL_NAME}/forks?per_page=100`;

    const response = await githubApiRequest(url, accessToken);
    if (!response.ok) {
        throw new Error(`Failed to fetch forks for ${UPSTREAM_REPO_FULL_NAME}.`);
    }

    const forks = await response.json();
    const userFork = forks.find((fork: any) => fork.owner.login === userLogin);

    if (userFork) {
        console.log(`> Found existing fork: '${userFork.name}'`);
        return userFork.name;
    }
    
    console.log('> No existing fork found for this user.');
    return null;
}

// Helper to create a new fork and wait for it
async function createNewFork(accessToken: string, userLogin: string): Promise<string> {
    console.log(`Creating new fork named '${DEFAULT_FORK_NAME}' for ${userLogin}...`);
    const createForkResponse = await githubApiRequest(`/repos/${UPSTREAM_REPO_FULL_NAME}/forks`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ name: DEFAULT_FORK_NAME }),
    });

    if (!createForkResponse.ok) {
        const errorBody = await createForkResponse.json();
        throw new Error(`GitHub API failed to start fork creation: ${errorBody.message}`);
    }

    // Poll to wait for the fork to be ready
    let forkReady = false;
    for (let i = 0; i < 15; i++) { // Max 30s timeout
        await new Promise(resolve => setTimeout(resolve, 2000));
        const checkResponse = await githubApiRequest(`/repos/${userLogin}/${DEFAULT_FORK_NAME}`, accessToken);
        if (checkResponse.ok) {
            forkReady = true;
            console.log('Fork is ready!');
            break;
        }
    }

    if (!forkReady) {
        throw new Error(`Timed out waiting for fork. This can happen if you already have a fork of ${UPSTREAM_REPO_FULL_NAME} with a different name. Please rename it to '${DEFAULT_FORK_NAME}' or delete it.`);
    }
    
    return DEFAULT_FORK_NAME;
}

// Helper to ensure the user's blueprint directory exists
async function ensurePlaceholderFile(octokit: any, owner: string, repo: string) {
    const placeholderPath = `blueprints/users/${owner}/.gitkeep`;
    console.log(`Ensuring placeholder file exists at: ${placeholderPath} in repo ${repo}`);
    
    try {
        // First, try to get the file's SHA to see if it exists.
        // This avoids an error if we try to create a file that's already there.
        await octokit.repos.getContent({
            owner,
            repo,
            path: placeholderPath,
        });
        console.log("Placeholder file already exists.");
    } catch (error: any) {
        // If it's a 404, the file doesn't exist, so we create it.
        if (error.status === 404) {
            console.log("Placeholder file not found, creating it...");
            await octokit.repos.createOrUpdateFileContents({
                owner,
                repo,
                path: placeholderPath,
                message: 'feat: initialize user blueprint directory',
                content: Buffer.from('').toString('base64'),
            });
            console.log("Placeholder file created.");
        } else {
            // Re-throw other errors
            throw error;
        }
    }
}

export async function POST(req: NextRequest) {
    const accessToken = await getAccessToken(req);
    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const shouldCreateFork = body.createFork === true;

    try {
        const { Octokit } = await import('@octokit/rest');
        const octokit = new Octokit({ auth: accessToken });

        const userResponse = await octokit.users.getAuthenticated();
        const userLogin = userResponse.data.login;
        
        // Quick check: if we already have a fork with the expected name, we can skip most of the work
        let userFork;
        try {
            userFork = await octokit.repos.get({
                owner: userLogin,
                repo: DEFAULT_FORK_NAME
            });

            // If we get here, the fork exists, so we can return early
            if (userFork.data) {
                console.log(`Found existing user fork: '${userFork.data.full_name}' (quick check)`);
                await ensurePlaceholderFile(octokit, userLogin, DEFAULT_FORK_NAME);
                return NextResponse.json({
                    message: 'Workspace setup completed successfully',
                    forkName: userFork.data.full_name,
                    forkCreated: false
                });
            }
        } catch (error: any) {
            // Fork doesn't exist, continue with the full setup process
            console.log('Fork not found via quick check, proceeding with full setup...');
        }
        
        const forks = await octokit.repos.listForks({
            owner: UPSTREAM_OWNER,
            repo: UPSTREAM_REPO_NAME,
        });
        
        userFork = forks.data.find(fork => fork.owner.login === userLogin);

        let forkFullName: string;
        let forkCreated = false;

        if (userFork) {
            console.log(`Found existing user fork: '${userFork.full_name}'`);
            forkFullName = userFork.full_name;
        } else if (shouldCreateFork) {
            console.log(`No existing fork found. Creating one named '${DEFAULT_FORK_NAME}'...`);
            let newForkResponse;
            try {
                newForkResponse = await octokit.repos.createFork({
                    owner: UPSTREAM_OWNER,
                    repo: UPSTREAM_REPO_NAME,
                    name: DEFAULT_FORK_NAME,
                });
            } catch (forkError: any) {
                // Check if error is due to repo name already being taken
                if (forkError.status === 422 || forkError.message?.includes('name already exists')) {
                    throw new Error(
                        `A repository named '${DEFAULT_FORK_NAME}' already exists in your account but is not a fork of weval-org/configs. ` +
                        `Please rename or delete that repository, or use a different GitHub account.`
                    );
                }
                throw forkError; // Re-throw other errors
            }

            forkFullName = newForkResponse.data.full_name;
            forkCreated = true;

            // Poll to wait for the fork to be ready, as it's an async operation
            let isReady = false;
            for (let i = 0; i < 15; i++) { // Max 30s timeout
                await new Promise(resolve => setTimeout(resolve, 2000));
                try {
                    await octokit.repos.get({
                        owner: userLogin,
                        repo: newForkResponse.data.name,
                    });
                    isReady = true;
                    console.log(`Fork '${forkFullName}' is ready!`);
                    break;
                } catch (e: any) {
                    if (e.status === 404) {
                        console.log(`Waiting for fork to be created... (Attempt ${i + 1})`);
                    } else {
                        throw e; // Re-throw other errors
                    }
                }
            }

            if (!isReady) {
                throw new Error(`Timed out waiting for fork ${forkFullName} to become available.`);
            }
        } else {
             console.log('No fork found and createFork is false. Informing user.');
            return NextResponse.json({ forkCreationRequired: true });
        }
        
        const [owner, repo] = forkFullName.split('/');

        await ensurePlaceholderFile(octokit, owner, repo);

        return NextResponse.json({ 
            message: 'Workspace setup completed successfully',
            forkName: forkFullName,
            forkCreated 
        });

    } catch (error: any) {
        console.error('[GitHub API] Workspace setup failed:', {
            shouldCreateFork,
            error: error.message,
            stack: error.stack,
        });

        let userMessage = error.message || 'Workspace setup failed';
        let suggestedActions = [
            'Try refreshing the page',
            'Verify you are logged in to GitHub',
            'Check that you have internet connectivity',
        ];

        if (error.message?.includes('403') || error.message?.includes('401')) {
            userMessage = 'GitHub authentication failed. Please log out and log back in.';
            suggestedActions = [
                'Click your profile menu and select "Logout"',
                'Log back in with GitHub',
                'Grant the necessary permissions when prompted',
            ];
        } else if (error.message?.includes('404')) {
            userMessage = 'Could not find the source repository. This may be a configuration issue.';
            suggestedActions = [
                'Contact support with the error ID below',
            ];
        } else if (error.message?.includes('timeout')) {
            userMessage = 'GitHub is taking too long to respond. Please try again.';
        }

        return NextResponse.json({
            error: userMessage,
            errorId: `ERR_GITHUB_SETUP_${Date.now()}`,
            suggestedActions,
            technicalDetails: {
                operation: 'workspace_setup',
                shouldCreateFork,
                originalError: error.message,
            }
        }, { status: 500 });
    }
} 