import { baseTestConfig } from '@sanchay/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  baseTestConfig,
  defineConfig({
    test: {
      coverage: {
        thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
      },
    },
  }),
);
