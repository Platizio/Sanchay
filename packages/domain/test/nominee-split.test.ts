import { NOMINATION_SPLIT_VECTORS } from '@sanchay/test-fixtures';
import { describe, expect, it } from 'vitest';
import {
  equalSplit,
  isValidAllocationSet,
  requiresAnnexureBAcceptance,
} from '../src/rules/nominee-split.js';

describe('equalSplit (H-12)', () => {
  for (const row of NOMINATION_SPLIT_VECTORS) {
    if (row.kind !== 'equalSplit') continue;
    it(`${row.id}: n=${row.n} -> ${JSON.stringify(row.expected)}`, () => {
      expect(equalSplit(row.n)).toEqual(row.expected);
    });
  }

  it('always sums to 100', () => {
    for (const n of [1, 2, 3] as const) {
      expect(equalSplit(n).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});

describe('isValidAllocationSet', () => {
  for (const row of NOMINATION_SPLIT_VECTORS) {
    if (row.kind !== 'custom') continue;
    it(`${row.id}: ${JSON.stringify(row.allocations)} -> valid=${row.valid}`, () => {
      expect(isValidAllocationSet(row.allocations)).toBe(row.valid);
    });
  }

  it('rejects a non-integer share', () => {
    expect(isValidAllocationSet([50.5, 49.5])).toBe(false);
  });

  it('rejects an empty set', () => {
    expect(isValidAllocationSet([])).toBe(false);
  });
});

describe('requiresAnnexureBAcceptance (H-12 opt-out gate, enforced at attest by E11)', () => {
  it('is true only for OPTED_OUT', () => {
    expect(requiresAnnexureBAcceptance('OPTED_OUT')).toBe(true);
    expect(requiresAnnexureBAcceptance('NOMINATED')).toBe(false);
    expect(requiresAnnexureBAcceptance('NOT_ASKED')).toBe(false);
  });
});
