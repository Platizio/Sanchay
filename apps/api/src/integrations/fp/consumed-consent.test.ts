import { describe, expect, it } from 'vitest';
import { assertConsumed, type ConsumedConsent } from './consumed-consent.js';
import { ConsentNotConsumedError } from './fp-errors.js';

function valid(): ConsumedConsent {
  return {
    challengeId: 'chal-1',
    investorId: 'inv-1',
    subjectType: 'PURCHASE',
    subjectIds: ['order-1'],
    snapshotSha256: 'a'.repeat(64),
    executeBefore: new Date('2027-01-01T00:00:00Z'),
  } as unknown as ConsumedConsent;
}

describe('assertConsumed', () => {
  it('accepts a well-shaped ConsumedConsent', () => {
    expect(() => assertConsumed(valid())).not.toThrow();
  });

  it('throws ConsentNotConsumedError for undefined', () => {
    expect(() => assertConsumed(undefined)).toThrow(ConsentNotConsumedError);
  });

  it('throws for a plain object missing challengeId', () => {
    const { challengeId, ...rest } = valid();
    expect(() => assertConsumed(rest)).toThrow(ConsentNotConsumedError);
  });

  it('throws when executeBefore is a string instead of a Date', () => {
    expect(() => assertConsumed({ ...valid(), executeBefore: '2027-01-01' })).toThrow(
      ConsentNotConsumedError,
    );
  });

  it('throws when subjectIds is not an array of strings', () => {
    expect(() => assertConsumed({ ...valid(), subjectIds: [1, 2] })).toThrow(
      ConsentNotConsumedError,
    );
  });
});
