/**
 * Identifiers for the seeded fixture run. Kept in one place so specs and the
 * fixture JSON stay in sync.
 */
export const FIXTURE = {
  configId: 'test-eval',
  configTitle: 'Test Evaluation Blueprint',
  runLabel: 'test-run',
  timestamp: '2025-06-01T12-00-00-000Z',
} as const;

export const ANALYSIS_PATH = `/analysis/${FIXTURE.configId}/${FIXTURE.runLabel}/${FIXTURE.timestamp}`;
