import { test, expect } from '@playwright/test';
import { FIXTURE } from './fixtures/constants';

/**
 * /latest is a client component that fetches `/api/runs/latest`, which reads
 * `latest_runs_summary.json` from storage. The seeded fixture makes the list
 * render a real run.
 */
test.describe('latest runs', () => {
  test('renders the seeded run from the latest-runs API', async ({ page }) => {
    await page.goto('/latest');

    // Fixture run's config title should appear once the fetch resolves.
    await expect(page.getByText(FIXTURE.configTitle).first()).toBeVisible();

    // A link into the analysis view for the fixture run should be present.
    await expect(
      page.locator(`a[href*="/analysis/${FIXTURE.configId}"]`).first(),
    ).toBeVisible();
  });

  test('serves the latest-runs API payload', async ({ request }) => {
    const res = await request.get('/api/runs/latest');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.runs)).toBe(true);
    expect(body.runs.some((r: any) => r.configId === FIXTURE.configId)).toBe(true);
  });
});
