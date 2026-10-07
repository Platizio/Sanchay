import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // A CDK synth takes about 6 s on a CI runner; the first test that synthesises pays for it.
    testTimeout: 30_000,
  },
});
