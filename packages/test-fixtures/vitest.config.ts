import { baseTestConfig } from '@sanchay/config/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(baseTestConfig, defineConfig({ test: {} }));
