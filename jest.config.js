const nextJest = require('next/jest');

/** @type {import('jest').Config} */
const createJestConfig = nextJest({
  dir: './',
});

const config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/_jest.setup.web.ts'],
  setupFilesAfterEnv: ['<rootDir>/_jest.setup.web.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: [
    '<rootDir>/src/cli/',
    '<rootDir>/src/lib/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(aws-sdk-client-mock|sinon)/)',
  ],
};

module.exports = createJestConfig(config); 