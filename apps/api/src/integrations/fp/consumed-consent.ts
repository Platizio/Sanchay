import type { Brand, ConsentSubjectType } from '@sanchay/domain';
import { ConsentNotConsumedError } from './fp-errors.js';

/**
 * Proof that ConsentEngine.useConsumed (E4, Plan 03) is on the call stack. Only ConsentEngine can
 * construct one; everyone else receives it as an opaque value and passes it through to
 * `FpTransport.call`. Plan-03 E3/E4 were drafted before this task existed and defined a
 * structurally identical local copy in `consent-engine.ts`; whichever of D3/E4 merges second
 * re-points E4 call sites at this export and deletes the local copy (noted in E4's own
 * Interfaces when it is expanded).
 */
export type ConsumedConsent = Brand<
  {
    readonly challengeId: string;
    readonly investorId: string;
    readonly subjectType: ConsentSubjectType;
    readonly subjectIds: readonly string[];
    readonly snapshotSha256: string;
    readonly executeBefore: Date;
  },
  'ConsumedConsent'
>;

function hasConsumedConsentShape(value: unknown): value is ConsumedConsent {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.challengeId === 'string' &&
    v.challengeId.length > 0 &&
    typeof v.investorId === 'string' &&
    v.investorId.length > 0 &&
    typeof v.subjectType === 'string' &&
    v.subjectType.length > 0 &&
    Array.isArray(v.subjectIds) &&
    v.subjectIds.every((id) => typeof id === 'string') &&
    typeof v.snapshotSha256 === 'string' &&
    v.snapshotSha256.length > 0 &&
    v.executeBefore instanceof Date
  );
}

/**
 * Runtime half of the P/M consent guard (the compile-time half is `FpCallArgs`, fp-transport.ts).
 * A caller that bypasses the type system with `any`, or that forwards `undefined`, is caught here.
 * This checks shape only, not expiry: `executeBefore` freshness is ConsentEngine's job at the point
 * it hands the value out, not FpTransport's job at the point it is spent.
 */
export function assertConsumed(value: unknown): asserts value is ConsumedConsent {
  if (!hasConsumedConsentShape(value)) {
    throw new ConsentNotConsumedError();
  }
}
