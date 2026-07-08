import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    globals: true,
    testTimeout: 30_000,
    pool: 'forks',
  },
});
