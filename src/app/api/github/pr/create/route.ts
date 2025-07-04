import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/github/auth-utils';

async function githubApiRequest(endpoint: string, token: string, options: RequestInit = {}) {
    const response = await fetch(`https://api.github.com${endpoint}`, {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
        },
    });
    return response;
}

export async function POST(req: NextRequest) {
    const accessToken = await getAccessToken(req);
    if (!accessToken) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    try {
        const { forkName, title, body } = await req.json();

        if (!forkName || !title || !body) {
            return NextResponse.json(
                { error: 'Fork name, title, and body are required' },
                { status: 400 },
            );
        }

        const userResponse = await githubApiRequest('/user', accessToken);
        if (!userResponse.ok) {
            throw new Error('Failed to fetch user data');
        }
        const user = await userResponse.json();
        const userLogin = user.login;

        const prData = {
            title,
            body,
            head: `${userLogin}:main`,
            base: 'main',
        };

        const response = await githubApiRequest(
            '/repos/weval-org/configs/pulls',
            accessToken,
            {
                method: 'POST',
                body: JSON.stringify(prData),
            },
        );

        const responseData = await response.json();

        if (!response.ok) {
            console.error('Failed to create PR:', responseData);
            throw new Error(`Failed to create pull request: ${responseData.message}`);
        }

        return NextResponse.json(responseData);

    } catch (error: any) {
        console.error('Create PR failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
} 