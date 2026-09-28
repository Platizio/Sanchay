/**
 * Shared Vitest settings for TypeScript library packages.
 * Plain ESM so the Vitest config loader imports it without transpiling.
 * Packages merge this with mergeConfig() and add their own coverage thresholds.
 */
export const baseTestConfig = {
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
};
