import { z } from 'zod';
import { CONSENT_SUBJECT_TYPES, LEGAL_DOCUMENT_KEYS } from '../platform.js';
import { canonicalize, type JcsValue } from './jcs.js';

export const SNAPSHOT_VERSION = 'sanchay.consent.v2';

/**
 * One consent snapshot (spec §4.1). Every decimal (amount, units, NAV) is a fixed-scale STRING, never a
 * JS number, so the schema cannot admit a float and `canonicalize` never has to reject one at hash time.
 * There is deliberately no timestamp field: the same investor intent must hash identically whether it is
 * approved immediately or after a resend, so only facts that change the investor's exposure participate.
 */
export const ConsentSnapshotV2Schema = z.strictObject({
  version: z.literal(SNAPSHOT_VERSION),
  subjectType: z.enum(CONSENT_SUBJECT_TYPES),
  investorId: z.uuid(),
  subjects: z.array(z.strictObject({ table: z.string().min(1), subjectId: z.uuid() })).min(1),
  legalDocuments: z
    .array(
      z.strictObject({
        key: z.enum(LEGAL_DOCUMENT_KEYS),
        version: z.string().min(1),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .min(1),
  /** `RuntimeConfig.get(exec, 'money_params_version')` (D1) at snapshot-build time. */
  moneyParamsVersion: z.string().min(1),
  /** Masked destinations the OTPs were rendered against, for a human-readable audit trail only. */
  destinationsMasked: z.array(z.string()),
  /**
   * Subject-specific rendered facts, always as strings: amount, units, schemeShort, schemeIsin,
   * navDateLine, bankAccountLast4, action, and so on. Individual subject tasks (E20, F2, ...) extend
   * this bag through their own `SNAPSHOT_BUILDERS` entry; the schema keeps it open on purpose because
   * the closed set of keys differs per `subjectType` and is not fully known until those tasks land.
   */
  fields: z.record(z.string(), z.string()),
});

export type ConsentSnapshotV2 = z.infer<typeof ConsentSnapshotV2Schema>;

/** SHA-256 (hex) of the JCS canonical form, computed with the Web Crypto API so this stays usable from
 * the API (Node 24, which exposes `globalThis.crypto`), the web app and — if ever needed — Android/Expo,
 * without adding a new dependency (A1). */
export async function snapshotSha256(snapshot: ConsentSnapshotV2): Promise<string> {
  const canonical = canonicalize(snapshot as unknown as JcsValue);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
