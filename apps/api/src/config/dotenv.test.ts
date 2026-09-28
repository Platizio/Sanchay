import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadDotEnvFile, mergeDotEnv } from './dotenv.js';

const dir = mkdtempSync(join(tmpdir(), 'sanchay-dotenv-'));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('mergeDotEnv', () => {
  it('fills only missing keys, so the process environment always wins', () => {
    const target: Record<string, string | undefined> = { PORT: '4000', SANCHAY_APP_ENV: 'test' };
    const added = mergeDotEnv(
      target,
      'PORT=3000\nSANCHAY_APP_ENV=local\nSANCHAY_LOG_LEVEL=debug\n',
    );
    expect(added).toEqual(['SANCHAY_LOG_LEVEL']);
    expect(target).toEqual({ PORT: '4000', SANCHAY_APP_ENV: 'test', SANCHAY_LOG_LEVEL: 'debug' });
  });

  it('ignores comments and unquotes values', () => {
    const target: Record<string, string | undefined> = {};
    mergeDotEnv(target, '# local only\nSANCHAY_MAILPIT_URL="http://localhost:8025"\n');
    expect(target).toEqual({ SANCHAY_MAILPIT_URL: 'http://localhost:8025' });
  });
});

describe('loadDotEnvFile', () => {
  it('returns [] and changes nothing when the file does not exist', () => {
    const target: Record<string, string | undefined> = { A: '1' };
    expect(loadDotEnvFile(join(dir, 'missing.env'), target)).toEqual([]);
    expect(target).toEqual({ A: '1' });
  });

  it('reads a real file', () => {
    const file = join(dir, 'real.env');
    writeFileSync(file, 'SANCHAY_APP_ROLE=migrate\n');
    const target: Record<string, string | undefined> = {};
    expect(loadDotEnvFile(file, target)).toEqual(['SANCHAY_APP_ROLE']);
    expect(target.SANCHAY_APP_ROLE).toBe('migrate');
  });
});
