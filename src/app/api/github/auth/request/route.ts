import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId || !appUrl) {
    const missingVars = [
      !clientId && 'GITHUB_CLIENT_ID',
      !appUrl && 'NEXT_PUBLIC_APP_URL',
    ].filter(Boolean);
    console.error(`[Auth Request] Server Configuration Error: Aborting because the following environment variables are missing: ${missingVars.join(', ')}`);
    return NextResponse.json({ error: 'GitHub Client ID or App URL not configured in environment.' }, { status: 500 });
  }

  // The 'public_repo' scope allows creating forks and PRs for public repositories.
  // The 'read:org' scope allows reading organization membership, which helps
  // ensure the app can see the organization the user is granting access to..
  const scopes = ['public_repo', 'read:org'];
  const scopeString = scopes.join(' ');

  const redirect_uri = `${appUrl}/api/github/auth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopeString,
    redirect_uri: redirect_uri,
  });

  const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
  
  console.log(`[Auth] Redirecting to GitHub for authorization. URL: ${authUrl}`);
  
  return NextResponse.redirect(authUrl);
}