import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeEvidence } from '../src/evidence.js';
import { CHAIN_NAMES, runChain } from '../src/smoke.js';

describe('fp-probes smoke harness (dry-run against its own fake responder)', () => {
  it('runs every chain with no FAILED step', async () => {
    for (const chain of CHAIN_NAMES) {
      const result = await runChain(chain, { env: 'fake' });
      expect(
        result.steps.some((s) => s.status === 'FAILED'),
        chain,
      ).toBe(false);
      expect(
        result.steps.some((s) => s.status === 'PASSED'),
        chain,
      ).toBe(true);
    }
  });

  it('writes evidence markdown naming every step', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fp-probes-'));
    const result = await runChain('lumpsum', { env: 'fake' });
    const file = await writeEvidence(dir, 'lumpsum', result);
    const text = await readFile(file, 'utf8');
    for (const step of result.steps) {
      expect(text).toContain(step.name);
    }
    expect(text).toContain('lumpsum');
  });
});
