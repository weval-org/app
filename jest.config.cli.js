/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  maxWorkers: 4, // Limit parallel execution to prevent resource exhaustion
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      diagnostics: {
        ignoreCodes: [151001]
      }
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: [
    '<rootDir>/src/cli/**/*.test.ts',
    '<rootDir>/src/lib/**/*.test.ts',
  ],
  transformIgnorePatterns: [
    '/node_modules/(?!(@netlify/blobs|@netlify/runtime-utils)/)',
  ],
  collectCoverage: true,
  coverageDirectory: 'coverage/cli',
  coverageReporters: ['json', 'lcov', 'text', 'clover'],
}; 