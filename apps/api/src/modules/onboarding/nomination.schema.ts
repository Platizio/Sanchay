import { MAX_NOMINEES, NOMINATION_DECISIONS, NOMINEE_ID_TYPES } from '@sanchay/domain';
import { sql } from 'drizzle-orm';
import { boolean, check, integer, jsonb, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, appSchema, bytea, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { investors } from '../identity/identity.schema.js';
import { newId } from '../platform/ids.js';

export const NOMINEE_STATUSES = ['CURRENT', 'REPLACED'] as const;
export type NomineeStatus = (typeof NOMINEE_STATUSES)[number];

/** FP `related_parties.relationship` enum subset the pilot exposes. */
export const NOMINEE_RELATIONSHIPS = [
  'FATHER',
  'MOTHER',
  'SPOUSE',
  'SON',
  'DAUGHTER',
  'BROTHER',
  'SISTER',
  'GRANDFATHER',
  'GRANDMOTHER',
  'GRANDSON',
  'GRANDDAUGHTER',
  'OTHERS',
] as const;
export type NomineeRelationship = (typeof NOMINEE_RELATIONSHIPS)[number];

/**
 * One row per nominee per set. A PUT writes a whole new set under `set_version + 1` and marks the prior
 * CURRENT set REPLACED, so history stays queryable. The per-set sum = 100 invariant is a deferred
 * constraint trigger (migration `nominees_set_sum`).
 */
export const nominees = appSchema.table(
  'nominees',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('nominees')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => investors.id, { onDelete: 'restrict' }),
    setVersion: integer('set_version').notNull(),
    position: smallint('position').notNull(),
    nameEnc: bytea('name_enc').notNull(),
    nameLength: smallint('name_length').notNull(),
    relationship: text('relationship', { enum: NOMINEE_RELATIONSHIPS }).notNull(),
    isMinor: boolean('is_minor').notNull().default(false),
    dobEnc: bytea('dob_enc'),
    guardianNameEnc: bytea('guardian_name_enc'),
    idType: text('id_type', { enum: NOMINEE_ID_TYPES }),
    idValueEnc: bytea('id_value_enc'),
    allocationPct: smallint('allocation_pct').notNull(),
    fpRelatedPartyId: text('fp_related_party_id'),
    sentToFpFields: jsonb('sent_to_fp_fields').$type<string[]>(),
    status: text('status', { enum: NOMINEE_STATUSES }).notNull().default('CURRENT'),
  },
  (t) => [
    check('nominees_position_ck', sql`position BETWEEN 1 AND ${sql.raw(String(MAX_NOMINEES))}`),
    check('nominees_name_length_ck', sql`name_length <= 40`),
    check('nominees_relationship_ck', inList('relationship', NOMINEE_RELATIONSHIPS)),
    check('nominees_id_type_ck', inList('id_type', NOMINEE_ID_TYPES)),
    check('nominees_status_ck', inList('status', NOMINEE_STATUSES)),
    check('nominees_allocation_pct_ck', sql`allocation_pct BETWEEN 1 AND 100`),
    check(
      'nominees_minor_dob_ck',
      sql`(NOT is_minor) OR (dob_enc IS NOT NULL AND guardian_name_enc IS NOT NULL)`,
    ),
    check('nominees_id_value_pair_ck', sql`(id_type IS NULL) = (id_value_enc IS NULL)`),
    check('nominees_pan_adult_ck', sql`id_type IS DISTINCT FROM 'PAN' OR NOT is_minor`),
    unique('nominees_set_position_uq').on(t.investorId, t.setVersion, t.position),
  ],
);

/** One current row per investor (not append-only): the latest nomination decision. */
export const nominationDecisions = appSchema.table(
  'nomination_decisions',
  {
    investorId: uuid('investor_id')
      .primaryKey()
      .references(() => investors.id, { onDelete: 'restrict' }),
    ...stdColumns(),
    ...actorColumns(),
    decision: text('decision', { enum: NOMINATION_DECISIONS }).notNull(),
    effectiveSetVersion: integer('effective_set_version'),
    displayPreference: boolean('display_preference'),
    consentRecordId: uuid('consent_record_id'),
    decidedAt: tstz('decided_at').notNull(),
  },
  () => [
    check('nomination_decisions_decision_ck', inList('decision', NOMINATION_DECISIONS)),
    check(
      'nomination_decisions_display_pref_ck',
      sql`decision <> 'NOMINATED' OR display_preference IS NOT NULL`,
    ),
  ],
);
