import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'GitHub Client ID not configured in environment.' }, { status: 500 });
  }

  // The 'public_repo' scope allows creating forks and PRs for public repositories.
  // The 'read:org' scope allows reading organization membership, which helps
  // ensure the app can see the organization the user is granting access to..
  const scopes = ['public_repo', 'read:org'];
  const scopeString = scopes.join(' ');

  // The redirect_uri is configured in the GitHub OAuth App settings.
  // Providing it here can be redundant and can lead to mismatches.
  // GitHub will use the primary callback URL registered with the OAuth App.
  const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=${encodeURIComponent(scopeString)}`;
  
  return NextResponse.redirect(authUrl);
}