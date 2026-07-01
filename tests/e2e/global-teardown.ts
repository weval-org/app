import { cleanupFixtures } from './fixtures/seed';

/**
 * Restores `.results/` to its pre-run state: overwritten files are put back
 * and anything the seed step created is removed.
 */
export default function globalTeardown() {
  cleanupFixtures();
}
