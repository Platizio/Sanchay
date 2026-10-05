/**
 * Pure pieces of me.get v2 (F14, R-18). The read itself lives in OnboardingQueries.me (E5's file).
 *
 * An investor accepts a legal document in one of two places:
 * - declaration_stagings (E10, ONB-15): one current row per key, with the version they saw;
 * - consent_records DOCUMENT_ACCEPTANCE (E3 recordAcceptance: KYC_CONSENT at ONB-02, and E13's
 *   legal.acceptPending re-accept). These rows carry no version, so the read resolves the version
 *   that was PUBLISHED and effective at the acceptance instant (null when none was).
 * The latest acceptance per key wins; a row whose version could not be resolved is ignored.
 */
export interface LegalAcceptanceRow {
  key: string;
  version: string | null;
  at: Date;
}

export interface AcceptedLegalVersion {
  key: string;
  version: string;
}

export function mergeLegalAcceptances(rows: readonly LegalAcceptanceRow[]): AcceptedLegalVersion[] {
  const latest = new Map<string, { version: string; at: number }>();
  for (const row of rows) {
    if (row.version === null) continue;
    const at = row.at.getTime();
    const seen = latest.get(row.key);
    if (seen === undefined || at > seen.at) latest.set(row.key, { version: row.version, at });
  }
  return [...latest.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, { version }]) => ({ key, version }));
}

/** Risk-profile statuses me.get reports; SUPERSEDED rows are history and never shown. */
export const SHOWN_RISK_PROFILE_STATUSES = ['ACTIVE', 'STALE', 'EXPIRED'] as const;
export type ShownRiskProfileStatus = (typeof SHOWN_RISK_PROFILE_STATUSES)[number];

export function isShownRiskProfileStatus(status: string): status is ShownRiskProfileStatus {
  return (SHOWN_RISK_PROFILE_STATUSES as readonly string[]).includes(status);
}

/** The support and grievance contacts every account page shows (DSC-21, HLP-05). */
export const SUPPORT_CONTACTS = {
  email: 'support@sanchay.in',
  phone: null,
  grievanceEmail: 'grievance@sanchay.in',
} as const;
