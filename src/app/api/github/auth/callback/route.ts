import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

async function encryptToken(token: string, secret: string) {
  const jose = await import('jose');
  const key = createHash('sha256').update(secret).digest();
  const jwt = await new jose.EncryptJWT({ 'access_token': token })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime('7d') // Set a 7-day expiration time for the session
    .encrypt(key);
  return jwt;
}

export async function GET(req: NextRequest) {
  console.log("[Auth Callback] Received request from GitHub.");
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    console.error(`[Auth Callback] GitHub returned an error: ${error}`);
    return NextResponse.redirect(new URL('/sandbox?error=' + encodeURIComponent(error), req.nextUrl.origin));
  }

  if (!code) {
    console.error("[Auth Callback] No authorization code provided in the request.");
    return NextResponse.redirect(new URL('/sandbox?error=' + encodeURIComponent('Authorization code not provided.'), req.nextUrl.origin));
  }

  console.log("[Auth Callback] Authorization code received. Preparing for token exchange.");

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  console.log("[Auth Callback] Verifying environment variable presence and content:");
  console.table({
    GITHUB_CLIENT_ID: clientId ? `Present (Value: ${clientId})` : 'Missing',
    GITHUB_CLIENT_SECRET: clientSecret ? `Present (Ends with: ...${clientSecret.slice(-4)})` : 'Missing',
    SESSION_SECRET: sessionSecret ? `Present (Length: ${sessionSecret.length})` : 'Missing',
    NEXT_PUBLIC_APP_URL: appUrl ? `Present (Value: ${appUrl})` : 'Missing',
  });

  if (!clientId || !clientSecret || !sessionSecret || !appUrl) {
    const missingVars = [
      !clientId && 'GITHUB_CLIENT_ID',
      !clientSecret && 'GITHUB_CLIENT_SECRET',
      !sessionSecret && 'SESSION_SECRET',
      !appUrl && 'NEXT_PUBLIC_APP_URL',
    ].filter(Boolean);

    console.error(`[Auth Callback] Server Configuration Error: Aborting because the following environment variables are missing: ${missingVars.join(', ')}`);
    return NextResponse.redirect(new URL('/sandbox?error=' + encodeURIComponent('Server configuration error.'), req.nextUrl.origin));
  }

  const redirect_uri = `${appUrl}/api/github/auth/callback`;
  console.log(`[Auth Callback] Using redirect_uri for token exchange: ${redirect_uri}`);

  try {
    console.log("[Auth Callback] Attempting to exchange code for access token with GitHub.");
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirect_uri,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("[Auth Callback] GitHub token exchange failed:", data);
      throw new Error(data.error_description || 'Failed to retrieve access token from GitHub.');
    }

    const accessToken = data.access_token;
    console.log("[Auth Callback] Successfully retrieved access token. Encrypting and setting session cookie.");
    
    // Encrypt the token before storing it in the cookie
    const encryptedToken = await encryptToken(accessToken, sessionSecret);

    // Always redirect to production URL (weval.org) after successful login
    // This ensures users end up on the canonical domain regardless of where they started
    const nextResponse = NextResponse.redirect(new URL('/sandbox', appUrl));

    nextResponse.cookies.set('github_session', encryptedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        maxAge: 60 * 60 * 24 * 7, // 1 week, matches JWT expiration
        path: '/',
    });

    console.log(`[Auth Callback] GitHub authentication successful. Redirecting to ${appUrl}/sandbox`);
    return nextResponse;

  } catch (err: any) {
    console.error('[Auth Callback] Final exception caught:', err);
    // Use appUrl for error redirect too (we're past validation at this point)
    return NextResponse.redirect(new URL('/sandbox?error=' + encodeURIComponent(err.message), appUrl));
  }
} 