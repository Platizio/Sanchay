import {
  CONSENT_SUBJECT_TYPES,
  type ConsentSnapshotV2,
  type ConsentSubjectType,
  SNAPSHOT_VERSION,
} from '@sanchay/domain';
import type { DbExecutor } from '../../db/client.js';

/**
 * At `create`, `destinationsMasked` is the resolver's live masks and `fields` is the caller's input.
 * At `approve` (RV-03-1), both are echoed from the challenge's stored snapshot: `fields` is the
 * builder's own earlier output. A builder that derives a fact from a subject row must therefore spread
 * `ctx.fields` FIRST and write the live value over it, so a changed subject row changes the hash.
 */
export interface SnapshotBuilderContext {
  investorId: string;
  subjects: Array<{ table: string; id: string }>;
  templateKey: string;
  moneyParamsVersion: string;
  destinationsMasked: string[];
  fields: Record<string, string>;
}

export type SnapshotBuilder = (
  exec: DbExecutor,
  ctx: SnapshotBuilderContext,
) => Promise<ConsentSnapshotV2>;

/** A builder that reads no subject-specific rows yet: it renders the fields the caller already resolved
 * (amount, units, scheme, ...) into the standard envelope. Each subject task (E20 orders, F2 plans and
 * mandates, E6/E11 onboarding attest, ...) replaces its own registry entry once its tables exist; until
 * then every CONSENT_SUBJECT_TYPES key uses this shared builder so ConsentEngine (E4) has a total map.
 * `legalDocuments` is [] here although `ConsentSnapshotV2Schema` says `.min(1)`: builder output is never
 * schema-parsed (RV-03-1), and a subject task's own builder lists the documents it binds. */
export function genericBuilder(subjectType: ConsentSubjectType): SnapshotBuilder {
  return async (_exec, ctx) => ({
    version: SNAPSHOT_VERSION,
    subjectType,
    investorId: ctx.investorId,
    subjects: ctx.subjects.map((s) => ({ table: s.table, subjectId: s.id })),
    legalDocuments: [],
    moneyParamsVersion: ctx.moneyParamsVersion,
    destinationsMasked: ctx.destinationsMasked,
    fields: ctx.fields,
  });
}

export const SNAPSHOT_BUILDERS: Record<ConsentSubjectType, SnapshotBuilder> = Object.fromEntries(
  CONSENT_SUBJECT_TYPES.map((subjectType) => [subjectType, genericBuilder(subjectType)]),
) as Record<ConsentSubjectType, SnapshotBuilder>;

/**
 * CNF-01's consent text (markdown) for a subject type, rendered by `consents.getChallenge` (E20 item 7). A
 * renderer reads only the stored snapshot and the legal documents by the key and version bound in it, so the
 * investor reads exactly what the hash covers. Registered at module load by the owning task (E20 PURCHASE); a
 * subject type with no renderer gets `consentText: null`.
 */
export type ConsentTextRenderer = (
  exec: DbExecutor,
  snapshot: ConsentSnapshotV2,
) => Promise<string>;

export const CONSENT_TEXT_RENDERERS: Partial<Record<ConsentSubjectType, ConsentTextRenderer>> = {};
