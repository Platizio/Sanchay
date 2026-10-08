import { describe, expect, it } from 'vitest';
import { parsePreVerification } from './pre-verification.js';

describe('parsePreVerification', () => {
  it('reads a completed identity pre-verification', () => {
    expect(
      parsePreVerification({
        id: 'pv_1',
        status: 'completed',
        readiness: { status: 'failed', code: 'kyc_rejected' },
      }),
    ).toEqual({
      status: 'completed',
      readiness: { status: 'failed', code: 'kyc_rejected' },
      bankAccounts: [],
    });
  });

  it('reads bank account results', () => {
    expect(
      parsePreVerification({
        status: 'completed',
        bank_accounts: [{ status: 'failed', code: 'low_confidence' }],
      }).bankAccounts,
    ).toEqual([{ status: 'failed', code: 'low_confidence' }]);
  });

  it('maps an unrecognised status to unknown and a missing readiness to null', () => {
    expect(parsePreVerification({ status: 'weird' })).toEqual({
      status: 'unknown',
      readiness: null,
      bankAccounts: [],
    });
  });
});
