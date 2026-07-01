import { seedFixtures } from './fixtures/seed';

/**
 * Runs once before the Playwright webServer boots, so the seeded `.results/`
 * fixtures are already on disk when `pnpm dev` starts reading them.
 */
export default function globalSetup() {
  seedFixtures();
}
