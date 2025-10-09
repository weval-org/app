import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  console.log('[Auth Logout] Logging out user and clearing session cookie.');

  const response = NextResponse.json({ success: true });

  // Delete the session cookie
  response.cookies.delete('github_session');

  console.log('[Auth Logout] Session cookie cleared successfully.');

  return response;
}
