import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

async function encryptToken(token: string, secret: string) {
  const jose = await import('jose');
  const key = createHash('sha256').update(secret).digest();
  const jwt = await new jose.EncryptJWT({ 'access_token': token })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime('30m') // Set a 30-minute expiration time for the session
    .encrypt(key);
  return jwt;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/sandbox2?error=' + encodeURIComponent(error), req.nextUrl.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/sandbox2?error=' + encodeURIComponent('Authorization code not provided.'), req.nextUrl.origin));
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const sessionSecret = process.env.SESSION_SECRET;

  if (!clientId || !clientSecret || !sessionSecret) {
    console.error("GitHub App credentials or session secret not configured.");
    return NextResponse.redirect(new URL('/sandbox2?error=' + encodeURIComponent('Server configuration error.'), req.nextUrl.origin));
  }

  try {
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
      }),
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error_description || 'Failed to retrieve access token from GitHub.');
    }

    const accessToken = data.access_token;
    
    // Encrypt the token before storing it in the cookie
    const encryptedToken = await encryptToken(accessToken, sessionSecret);

    const nextResponse = NextResponse.redirect(new URL('/sandbox2', req.nextUrl.origin));
    
    nextResponse.cookies.set('github_session', encryptedToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        maxAge: 60 * 30, // 30 minutes, matches JWT expiration
        path: '/',
    });

    return nextResponse;

  } catch (err: any) {
    console.error('GitHub auth callback failed:', err);
    return NextResponse.redirect(new URL('/sandbox2?error=' + encodeURIComponent(err.message), req.nextUrl.origin));
  }
} 