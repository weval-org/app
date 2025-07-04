import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('github_token')?.value;

  if (!token) {
    return new NextResponse('Authentication required.', { status: 401 });
  }

  try {
    // Make a lightweight API call to GitHub to validate the token.
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit({ auth: token });
    await octokit.users.getAuthenticated(); // This will throw 401 if token is bad
    
    return new NextResponse('Authenticated.', { status: 200 });

  } catch (error: any) {
    // If the token is invalid, Octokit throws an error.
    // We clear the invalid cookie and return 401 to trigger re-auth.
    const response = new NextResponse('Invalid token.', { status: 401 });
    response.cookies.set('github_token', '', { maxAge: 0 }); // Delete cookie
    return response;
  }
} 