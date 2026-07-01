import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'node:path';

const alias = {
  '@': path.resolve(__dirname, 'src'),
};

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { alias },
  test: {
    // Coverage (opt-in via --coverage). Mirrors the previous CLI Jest config.
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage/cli',
      reporter: ['json', 'lcov', 'text', 'clover'],
    },
    projects: [
      {
        plugins: [tsconfigPaths()],
        resolve: { alias },
        test: {
          name: 'web',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.web.ts'],
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/cli/**', 'src/lib/**', 'node_modules/**'],
        },
      },
      {
        plugins: [tsconfigPaths()],
        resolve: { alias },
        test: {
          name: 'cli',
          globals: true,
          environment: 'node',
          include: ['src/cli/**/*.test.ts', 'src/lib/**/*.test.ts'],
        },
      },
    ],
  },
});
