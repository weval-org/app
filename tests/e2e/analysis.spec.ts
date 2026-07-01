import { test, expect } from '@playwright/test';
import { FIXTURE, ANALYSIS_PATH } from './fixtures/constants';

/**
 * The analysis page is server-rendered from the run's `core.json` artefact
 * (via getCoreResult). The seeded fixture lets the full analysis view render
 * end-to-end without S3 or live model calls.
 */
test.describe('analysis run', () => {
  test('renders the seeded run title, models and coverage', async ({ page }) => {
    await page.goto(ANALYSIS_PATH);

    // Page title is derived from the run's configTitle.
    await expect(page).toHaveTitle(new RegExp(FIXTURE.configTitle, 'i'));

    // Config title is shown in the page header.
    await expect(page.getByText(FIXTURE.configTitle).first()).toBeVisible();

    // Both fixture models are rendered (by their parsed display names) in the
    // aggregate coverage view.
    await expect(page.getByText(/GPT 4o Mini/i).first()).toBeVisible();
    await expect(page.getByText(/Claude 3 Haiku/i).first()).toBeVisible();

    // The prompt selector is populated from the run's prompts.
    await expect(
      page.locator('option[value="prompt-math"]'),
    ).toHaveCount(1);
  });

  test('shows a not-found state for a run that does not exist', async ({ page }) => {
    await page.goto(
      `/analysis/${FIXTURE.configId}/${FIXTURE.runLabel}/2099-01-01T00-00-00-000Z`,
    );

    // notFound() renders Next's not-found UI; the fixture content must be absent.
    await expect(page.getByText(/this page could not be found/i)).toBeVisible();
    await expect(page.getByText(/Claude 3 Haiku/i)).toHaveCount(0);
  });
});
