import { test, expect } from '@playwright/test';
import { FIXTURE } from './fixtures/constants';

/**
 * The homepage is server-rendered from the `homepage_summary.json` aggregate.
 * With the seeded fixture in `.results/`, it renders the featured fixture
 * blueprint instead of erroring on empty storage.
 */
test.describe('homepage', () => {
  test('renders the title and the seeded featured blueprint', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Weval/i);

    // The seeded config should surface somewhere on the page.
    await expect(page.getByText(FIXTURE.configTitle).first()).toBeVisible();
  });

  test('links to the Collective Intelligence Project', async ({ page }) => {
    await page.goto('/');

    const cipLink = page.locator('a[href*="cip.org"]').first();
    await expect(cipLink).toBeVisible();
  });
});
