import { NextRequest, NextResponse } from 'next/server';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const APP_REPO_SLUG = process.env.NEXT_PUBLIC_APP_REPO_SLUG || 'weval-org/app';

export async function POST(request: NextRequest) {
  try {
    if (!GITHUB_TOKEN) {
      return NextResponse.json(
        { error: 'Bug reporting is not configured' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { description, steps, blueprintId, email, pageUrl, browser, os } = body;

    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json(
        { error: 'Description is required' },
        { status: 400 }
      );
    }

    const title = `[Bug] ${description.slice(0, 80)}${description.length > 80 ? '...' : ''}`;

    const sections = [`## Description\n${description.trim()}`];

    if (steps) sections.push(`## Steps to Reproduce\n${steps.trim()}`);

    const details: string[] = [];
    if (blueprintId) details.push(`- **Blueprint ID:** ${blueprintId}`);
    if (pageUrl) details.push(`- **Page URL:** ${pageUrl}`);
    if (browser) details.push(`- **Browser:** ${browser}`);
    if (os) details.push(`- **OS:** ${os}`);
    if (email) details.push(`- **Reporter email:** ${email}`);
    if (details.length > 0) sections.push(`## Details\n${details.join('\n')}`);

    sections.push(`---\n*Submitted via in-app bug report*`);

    const issueBody = sections.join('\n\n');

    const res = await fetch(`https://api.github.com/repos/${APP_REPO_SLUG}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body: issueBody,
        labels: ['bug', 'from-app'],
      }),
    });

    if (!res.ok) {
      const gh = await res.json().catch(() => ({}));
      console.error('GitHub API error:', res.status, gh);
      return NextResponse.json(
        { error: 'Failed to create issue' },
        { status: 502 }
      );
    }

    const issue = await res.json();
    return NextResponse.json({ url: issue.html_url }, { status: 201 });
  } catch (err) {
    console.error('Bug report error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
