import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/github/auth-utils';
import { Buffer } from 'buffer';

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

        const fileResponse = await githubApiRequest(`/repos/${userLogin}/${forkName}/contents/${path}`, accessToken);

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

    const { path, content, sha, forkName } = await req.json();
    if (!path || content === undefined || !forkName) {
        return NextResponse.json({ error: 'File path, content, and fork name are required' }, { status: 400 });
    }

    try {
        const userResponse = await githubApiRequest('/user', accessToken);
        if (!userResponse.ok) throw new Error('Failed to fetch user data');
        const user = await userResponse.json();
        const userLogin = user.login;

        const body: { message: string; content: string; sha?: string } = {
            message: `feat(blueprints): update ${path}`,
            content: Buffer.from(content).toString('base64'),
        };
        
        if (sha) {
            body.sha = sha;
        }

        const response = await githubApiRequest(
            `/repos/${userLogin}/${forkName}/contents/${path}`,
            accessToken,
            {
                method: 'PUT',
                body: JSON.stringify(body),
            }
        );

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`Failed to save file: ${errorBody.message}`);
        }

        const data = await response.json();
        return NextResponse.json(data.content);

    } catch (error: any) {
        console.error('Save file failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const accessToken = await getAccessToken(req);
    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const { path, sha, forkName } = await req.json();
        if (!path || !sha || !forkName) {
            return NextResponse.json(
                { error: 'File path, sha, and fork name are required' },
                { status: 400 },
            );
        }
        
        const userResponse = await githubApiRequest('/user', accessToken);
        if (!userResponse.ok) throw new Error('Failed to fetch user data');
        const user = await userResponse.json();
        const userLogin = user.login;

        const response = await githubApiRequest(
            `/repos/${userLogin}/${forkName}/contents/${path}`,
            accessToken,
            {
                method: 'DELETE',
                body: JSON.stringify({
                    message: `feat(blueprints): delete ${path}`,
                    sha: sha,
                }),
            },
        );

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`Failed to delete file: ${errorBody.message}`);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Delete file failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}