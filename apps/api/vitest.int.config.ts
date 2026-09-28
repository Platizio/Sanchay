import { defineConfig } from 'vitest/config';
import { swcPlugin } from './vitest.shared.js';

export default defineConfig({
  plugins: [swcPlugin()],
  test: {
    include: ['test/int/**/*.int.test.ts'],
    globalSetup: ['test/int/global-setup.ts'],
    setupFiles: ['test/setup.ts'],
    environment: 'node',
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
