/** Typed view of D3's raw POA pre-verification (research fp-api 5.1: status goes accepted -> completed). */
export interface PreVerificationView {
  status: 'accepted' | 'completed' | 'failed' | 'unknown';
  readiness: { status: string; code: string | null } | null;
  bankAccounts: ReadonlyArray<{ status: string; code: string | null }>;
}

const KNOWN_STATUSES = ['accepted', 'completed', 'failed'] as const;

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function parsePreVerification(raw: Record<string, unknown>): PreVerificationView {
  const status = str(raw.status);
  const readiness = raw.readiness as Record<string, unknown> | undefined;
  const banks = Array.isArray(raw.bank_accounts)
    ? (raw.bank_accounts as Record<string, unknown>[])
    : [];
  return {
    status: KNOWN_STATUSES.find((s) => s === status) ?? 'unknown',
    readiness:
      readiness === undefined
        ? null
        : { status: str(readiness.status) ?? 'unknown', code: str(readiness.code) },
    bankAccounts: banks.map((b) => ({ status: str(b.status) ?? 'unknown', code: str(b.code) })),
  };
}
