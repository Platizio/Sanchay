import { defineConfig } from 'vitest/config';
import { baseTestConfig } from './vitest/base.mjs';

/**
 * This package's own tests (e.g. the .gitleaksignore governance check) run
 * against plain repo files, not `src/**`, so coverage thresholds from
 * baseTestConfig's `src/**` glob would always read 0% here. Reuse only the
 * `test.include` / environment from the shared preset and skip coverage.
 */
export default defineConfig({
  test: {
    include: baseTestConfig.test.include,
    environment: baseTestConfig.test.environment,
  },
});
