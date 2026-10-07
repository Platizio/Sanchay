import { describe, expect, it } from 'vitest';
import { FakeFp } from '../../src/integrations/fp/fake/fake-fp.js';
import { FpRead } from '../../src/integrations/fp/fp-read.js';
import { bootFpTestApp } from './fake-fp.js';

describe('bootFpTestApp', () => {
  it('boots a worker-role app wired to a real FakeFp', async () => {
    const t = await bootFpTestApp();
    try {
      expect(t.fakeFp).toBeInstanceOf(FakeFp);
      expect(t.app.get(FpRead)).toBeInstanceOf(FpRead);
      const plans = await t.app.get(FpRead).schemePlans();
      expect(plans.items).toHaveLength(10);
    } finally {
      await t.close();
    }
  });
});
