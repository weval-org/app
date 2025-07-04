import { NextRequest } from 'next/server';
import { createHash } from 'crypto';

// This function lives here so it can be reused by all workspace API endpoints.
async function decryptToken(jwt: string, secret: string): Promise<string | null> {
  const jose = await import('jose');
  const key = createHash('sha256').update(secret).digest();
  try {
    const { payload } = await jose.jwtDecrypt(jwt, key);
    if (typeof payload.access_token === 'string') {
        return payload.access_token;
    }
    return null;
  } catch (e) {
    console.error('Token decryption failed:', e);
    return null;
  }
}

export async function getAccessToken(req: NextRequest): Promise<string | null> {
    const sessionCookie = req.cookies.get('github_session');
    const sessionSecret = process.env.SESSION_SECRET;

    if (!sessionCookie || !sessionSecret) {
        return null;
    }

    const encryptedToken = sessionCookie.value;
    const accessToken = await decryptToken(encryptedToken, sessionSecret);

    return accessToken;
} 