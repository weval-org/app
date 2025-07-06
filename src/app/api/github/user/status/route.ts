import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/github/auth-utils';

async function getGitHubUser(accessToken: string) {
    try {
        const response = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            console.error('Failed to fetch GitHub user:', response.statusText);
            return null;
        }

        const userData = await response.json();
        return {
            isLoggedIn: true,
            username: userData.login,
            avatarUrl: userData.avatar_url,
        };
    } catch (error) {
        console.error('Error fetching GitHub user:', error);
        return null;
    }
}

export async function GET(req: NextRequest) {
  const accessToken = await getAccessToken(req);

  if (!accessToken) {
    return NextResponse.json({ isLoggedIn: false });
  }

  const user = await getGitHubUser(accessToken);

  if (user) {
    return NextResponse.json(user);
  }
  
  // If we have a token but can't fetch the user, it's likely invalid.
  const response = NextResponse.json({ isLoggedIn: false });
  response.cookies.delete('github_session');
  return response;
} 