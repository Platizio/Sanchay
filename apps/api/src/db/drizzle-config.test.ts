import { globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../../drizzle.config.js';

const apiRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('drizzle.config.ts', () => {
  it('its schema globs match every *.schema.ts file under src', () => {
    const globs = typeof config.schema === 'string' ? [config.schema] : (config.schema ?? []);
    const matched = new Set(globs.flatMap((pattern) => globSync(pattern, { cwd: apiRoot })));
    const all = globSync('src/**/*.schema.ts', { cwd: apiRoot });
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((file) => !matched.has(file))).toEqual([]);
  });
});
