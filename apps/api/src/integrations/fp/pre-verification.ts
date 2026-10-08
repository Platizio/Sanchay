import { FpRejectedError } from './fp-errors.js';

/** One result block of a pre-verification (readiness, pan, name, date_of_birth, or a bank account). */
export interface PreVerificationBlock {
  status: string;
  code: string | null;
}

/** Typed view of D3's raw POA pre-verification (research fp-api 5.1: status goes accepted -> completed). */
export interface PreVerificationView {
  status: 'accepted' | 'completed' | 'failed' | 'unknown';
  readiness: PreVerificationBlock | null;
  /** The investor-data checks that sit beside readiness (research fp-api 5.1: pan, name, date_of_birth codes). */
  pan: PreVerificationBlock | null;
  name: PreVerificationBlock | null;
  dateOfBirth: PreVerificationBlock | null;
  bankAccounts: ReadonlyArray<PreVerificationBlock>;
}

const KNOWN_STATUSES = ['accepted', 'completed', 'failed'] as const;

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function block(value: unknown): PreVerificationBlock | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return { status: str(raw.status) ?? 'unknown', code: str(raw.code) };
}

export function parsePreVerification(raw: Record<string, unknown>): PreVerificationView {
  const status = str(raw.status);
  const banks = Array.isArray(raw.bank_accounts)
    ? (raw.bank_accounts as Record<string, unknown>[])
    : [];
  return {
    status: KNOWN_STATUSES.find((s) => s === status) ?? 'unknown',
    readiness: block(raw.readiness),
    pan: block(raw.pan),
    name: block(raw.name),
    dateOfBirth: block(raw.date_of_birth),
    bankAccounts: banks.map((b) => ({ status: str(b.status) ?? 'unknown', code: str(b.code) })),
  };
}

/** Field codes that say the investor's own data was wrong (name/date_of_birth `mismatch`; pan `invalid`, `aadhaar_not_linked`). */
const FIELD_FAILURE_CODES = new Set(['mismatch', 'invalid', 'aadhaar_not_linked']);

/**
 * The first of pan, name and date_of_birth that FP reports as wrong, as the field name used in
 * `readiness_code` (`<field>_mismatch`), or null. `readiness.status = verified` is a fact about the PAN at
 * the KRA, so it says nothing about a mistyped name or date of birth (ONB-6). A field block that only
 * reports a provider hiccup (`upstream_error`) is no verdict.
 */
export function firstFieldFailure(
  view: PreVerificationView,
): 'pan' | 'name' | 'date_of_birth' | null {
  const fields = [
    ['pan', view.pan],
    ['name', view.name],
    ['date_of_birth', view.dateOfBirth],
  ] as const;
  for (const [field, result] of fields) {
    if (result === null) continue;
    if (result.code !== null && FIELD_FAILURE_CODES.has(result.code)) return field;
    if (result.status === 'failed' && result.code !== 'upstream_error') return field;
  }
  return null;
}

/**
 * A 4xx that FP gave for this investor's data, so retrying cannot help: the check settles at once. Not 401/403
 * (our credentials, not the investor: the job keeps failing and is retried, E20 owns eviction); 408/429 never
 * reach here, the transport raises them as FpAmbiguousError.
 */
export function isDefinitiveFpRejection(error: unknown): error is FpRejectedError {
  return (
    error instanceof FpRejectedError &&
    error.httpStatus >= 400 &&
    error.httpStatus < 500 &&
    error.httpStatus !== 401 &&
    error.httpStatus !== 403
  );
}
