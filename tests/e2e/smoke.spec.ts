import { test, expect } from '@playwright/test';

/**
 * Smoke tests target dependency-free, statically rendered routes so they pass
 * in CI without storage/API secrets. Data-driven routes (the homepage,
 * /latest, /analysis/*) are covered separately against seeded local fixtures —
 * see homepage.spec.ts, latest.spec.ts, analysis.spec.ts and tests/e2e/README.md.
 */
test.describe('smoke', () => {
  test('about page renders its title and key content', async ({ page }) => {
    await page.goto('/about');

    await expect(page).toHaveTitle(/About Weval/i);
    await expect(
      page.getByRole('heading', { name: /what are evaluations\?/i }),
    ).toBeVisible();
  });

  test('about page links out to the Collective Intelligence Project', async ({ page }) => {
    await page.goto('/about');

    const cipLink = page.locator('a[href*="cip.org"]').first();
    await expect(cipLink).toBeVisible();
  });
});
