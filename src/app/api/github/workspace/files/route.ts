import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/github/auth-utils';

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
        const forkName = req.nextUrl.searchParams.get('forkName');
        if (!forkName) {
            return NextResponse.json({ error: 'forkName parameter is required' }, { status: 400 });
        }
        
        const [owner, repo] = forkName.split('/');
        if (!owner || !repo) {
             return NextResponse.json({ error: 'Invalid forkName format. Expected owner/repo.' }, { status: 400 });
        }

        const workspacePath = `blueprints/users/${owner}`;
        
        const contentsResponse = await githubApiRequest(`/repos/${forkName}/contents/${workspacePath}`, accessToken);

        if (contentsResponse.status === 404) {
            // This is not an error, it just means the user's directory is empty.
            return NextResponse.json([]);
        }

        if (!contentsResponse.ok) {
            const errorBody = await contentsResponse.json();
            throw new Error(`Failed to list files from repo: ${errorBody.message}`);
        }

        const contents = await contentsResponse.json();

        const blueprintFiles = contents
            .filter((item: any) => item.type === 'file' && (item.name.endsWith('.yml') || item.name.endsWith('.yaml')))
            .map((item: any) => ({
                name: item.name,
                path: item.path,
                sha: item.sha,
                isLocal: false,
                lastModified: new Date().toISOString(), // This will be updated on fetch
            }));

        return NextResponse.json(blueprintFiles);

    } catch (error: any) {
        console.error('List workspace files failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}