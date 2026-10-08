import { MAX_NOMINEES, type NominationDecision } from '../investor.js';

/**
 * H-12: integer equal split, remainder to nominee 1.
 * equalSplit(1) = [100]; equalSplit(2) = [50, 50]; equalSplit(3) = [34, 33, 33].
 */
export function equalSplit(n: 1 | 2 | 3): number[] {
  const base = Math.floor(100 / n);
  const remainder = 100 - base * n;
  return Array.from({ length: n }, (_, index) => (index === 0 ? base + remainder : base));
}

/** Every share a 1..100 integer, at most MAX_NOMINEES entries, summing to exactly 100. */
export function isValidAllocationSet(allocations: readonly number[]): boolean {
  if (allocations.length === 0 || allocations.length > MAX_NOMINEES) return false;
  if (!allocations.every((pct) => Number.isInteger(pct) && pct >= 1 && pct <= 100)) return false;
  return allocations.reduce((sum, pct) => sum + pct, 0) === 100;
}

/** H-12: OPTED_OUT needs the Annexure-B text acknowledged; enforced by E10 staging and E11 attest. */
export function requiresAnnexureBAcceptance(decision: NominationDecision): boolean {
  return decision === 'OPTED_OUT';
}
