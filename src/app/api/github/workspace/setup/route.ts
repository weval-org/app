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
async function ensurePlaceholderFile(accessToken: string, userLogin: string, forkName: string) {
    const placeholderPath = `blueprints/users/${userLogin}/.gitkeep`;
    console.log(`Ensuring placeholder file exists at: ${placeholderPath} in repo ${forkName}`);
    
    const response = await githubApiRequest(
        `/repos/${userLogin}/${forkName}/contents/${placeholderPath}`,
        accessToken,
        {
            method: 'PUT',
            body: JSON.stringify({
                message: 'feat: initialize user blueprint directory',
                content: Buffer.from('').toString('base64'),
            }),
        }
    );

    // It's okay if it fails with 422 (already exists) or succeeds with 200/201.
    if (!response.ok && response.status !== 422) {
        const errorBody = await response.json();
        throw new Error(`Failed to create placeholder file: ${errorBody.message}`);
    }
}

export async function POST(req: NextRequest) {
    const accessToken = await getAccessToken(req);
    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const userResponse = await githubApiRequest('/user', accessToken);
        if (!userResponse.ok) throw new Error('Failed to fetch user data');
        const user = await userResponse.json();
        const userLogin = user.login;

        let forkName = await findExistingFork(accessToken, userLogin);

        if (forkName) {
            console.log(`Found existing user fork: '${forkName}'`);
        } else {
            forkName = await createNewFork(accessToken, userLogin);
        }

        await ensurePlaceholderFile(accessToken, userLogin, forkName);

        return NextResponse.json({ 
            message: 'Workspace setup completed successfully',
            forkName: forkName 
        });

    } catch (error: any) {
        console.error('Workspace setup failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
} 