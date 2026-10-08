import { describe, expect, it } from 'vitest';
import { FpAmbiguousError, FpRejectedError } from './fp-errors.js';
import {
  firstFieldFailure,
  isDefinitiveFpRejection,
  parsePreVerification,
} from './pre-verification.js';

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
      pan: null,
      name: null,
      dateOfBirth: null,
      bankAccounts: [],
    });
  });

  it('reads the pan, name and date_of_birth blocks (ONB-6)', () => {
    const view = parsePreVerification({
      status: 'completed',
      readiness: { status: 'verified' },
      pan: { status: 'completed' },
      name: { status: 'failed', code: 'mismatch' },
      date_of_birth: { status: 'failed', code: 'mismatch' },
    });
    expect(view.pan).toEqual({ status: 'completed', code: null });
    expect(view.name).toEqual({ status: 'failed', code: 'mismatch' });
    expect(view.dateOfBirth).toEqual({ status: 'failed', code: 'mismatch' });
  });

  it('keeps a field block that is not an object as null', () => {
    const view = parsePreVerification({ status: 'completed', pan: 'oops', name: null });
    expect(view.pan).toBeNull();
    expect(view.name).toBeNull();
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
      pan: null,
      name: null,
      dateOfBirth: null,
      bankAccounts: [],
    });
  });
});

describe('firstFieldFailure', () => {
  const view = (fields: Record<string, unknown>) =>
    parsePreVerification({ status: 'completed', readiness: { status: 'verified' }, ...fields });

  it('is null when every block passed or is absent', () => {
    expect(firstFieldFailure(view({}))).toBeNull();
    expect(firstFieldFailure(view({ pan: { status: 'completed' } }))).toBeNull();
  });

  it('names the failed field in the readiness-code vocabulary', () => {
    expect(firstFieldFailure(view({ date_of_birth: { status: 'failed', code: 'mismatch' } }))).toBe(
      'date_of_birth',
    );
    expect(firstFieldFailure(view({ name: { status: 'completed', code: 'mismatch' } }))).toBe(
      'name',
    );
    expect(firstFieldFailure(view({ pan: { status: 'failed', code: 'invalid' } }))).toBe('pan');
    expect(firstFieldFailure(view({ pan: { status: 'failed', code: 'aadhaar_not_linked' } }))).toBe(
      'pan',
    );
  });

  it('treats a provider hiccup on a field block as no verdict', () => {
    expect(
      firstFieldFailure(view({ pan: { status: 'failed', code: 'upstream_error' } })),
    ).toBeNull();
  });
});

describe('isDefinitiveFpRejection', () => {
  it('is true for a 4xx the investor data caused', () => {
    expect(isDefinitiveFpRejection(new FpRejectedError('preVerification.create', 422, null))).toBe(
      true,
    );
    expect(isDefinitiveFpRejection(new FpRejectedError('preVerification.get', 404, null))).toBe(
      true,
    );
  });

  it('is false for credential failures, ambiguous errors and anything else', () => {
    expect(isDefinitiveFpRejection(new FpRejectedError('preVerification.create', 401, null))).toBe(
      false,
    );
    expect(isDefinitiveFpRejection(new FpRejectedError('preVerification.create', 403, null))).toBe(
      false,
    );
    expect(
      isDefinitiveFpRejection(new FpAmbiguousError('preVerification.create', { status: 503 })),
    ).toBe(false);
    expect(isDefinitiveFpRejection(new Error('boom'))).toBe(false);
  });
});
