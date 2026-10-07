import {
  CHALLENGE_STATUSES,
  type ChallengeStatus,
  CONSENT_SUBJECT_TYPES,
  LEGAL_DOCUMENT_KEYS,
} from '@sanchay/domain';
import { sql } from 'drizzle-orm';
import { check, index, inet, jsonb, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, appSchema, bytea, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

export const LEGAL_DOCUMENT_STATUSES = ['DRAFT', 'PUBLISHED', 'RETIRED'] as const;
export type LegalDocumentStatus = (typeof LEGAL_DOCUMENT_STATUSES)[number];

// D5 owns the challenge state machine; re-exported so legal-consent code imports one module.
export { CHALLENGE_STATUSES, type ChallengeStatus };

export const CONSENT_FACTORS = ['SMS', 'EMAIL'] as const;
export type ConsentFactor = (typeof CONSENT_FACTORS)[number];

export const CONSENT_SUBJECT_ROW_STATUSES = ['PENDING', 'CONSENTED'] as const;
export type ConsentSubjectRowStatus = (typeof CONSENT_SUBJECT_ROW_STATUSES)[number];

export const CONSENT_RECORD_KINDS = ['CHALLENGE', 'DOCUMENT_ACCEPTANCE'] as const;
export type ConsentRecordKind = (typeof CONSENT_RECORD_KINDS)[number];

/** Append-only. sha256 is over the exact bytes of body_markdown, so a diff is provable. */
export const legalDocuments = appSchema.table(
  'legal_documents',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('legal_documents')),
    ...stdColumns(),
    ...actorColumns(),
    key: text('key', { enum: LEGAL_DOCUMENT_KEYS }).notNull(),
    version: text('version').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    sha256: bytea('sha256').notNull(),
    status: text('status', { enum: LEGAL_DOCUMENT_STATUSES }).notNull().default('DRAFT'),
    effectiveFrom: tstz('effective_from'),
  },
  (t) => [
    check('legal_documents_key_ck', inList('key', LEGAL_DOCUMENT_KEYS)),
    check('legal_documents_status_ck', inList('status', LEGAL_DOCUMENT_STATUSES)),
    unique('legal_documents_key_version_uq').on(t.key, t.version),
    index('legal_documents_key_published_idx')
      .on(t.key, t.effectiveFrom)
      .where(sql`status = 'PUBLISHED'`),
  ],
);

/**
 * The draft challenge behind one OTP-gated consent (spec §4.1, GAP-01: the draft is local only, no FP
 * write happens before CONSUMED). `snapshotEnc` is the JCS-canonical `ConsentSnapshotV2` payload,
 * AES-256-GCM under AAD `consent_challenges.snapshot_enc:<id>`; `snapshotSha256` is the same payload's
 * SHA-256, kept in the clear (it is not itself sensitive) so `approve` can `timingSafeEqual` it against
 * a live recompute without decrypting first.
 */
export const consentChallenges = appSchema.table(
  'consent_challenges',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('consent_challenges')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id').notNull(),
    subjectType: text('subject_type', { enum: CONSENT_SUBJECT_TYPES }).notNull(),
    folioId: uuid('folio_id'),
    templateKey: text('template_key', { enum: LEGAL_DOCUMENT_KEYS }).notNull(),
    snapshotEnc: bytea('snapshot_enc').notNull(),
    snapshotSha256: bytea('snapshot_sha256').notNull(),
    status: text('status', { enum: CHALLENGE_STATUSES }).notNull().default('PENDING'),
    requiredFactors: jsonb('required_factors').$type<ConsentFactor[]>().notNull(),
    moneyParamsVersion: text('money_params_version').notNull(),
    /** Non-PII rendering facts (scheme short name, action, amount/units strings) so `sendOtp` and
     * `approve` never have to decrypt `snapshotEnc` just to pick a DLT template (R-10). */
    renderAction: text('render_action'),
    renderAmount: text('render_amount'),
    renderUnits: text('render_units'),
    renderSchemeShort: text('render_scheme_short'),
    smsSendCount: smallint('sms_send_count').notNull().default(0),
    lastSmsSentAt: tstz('last_sms_sent_at'),
    expiresAt: tstz('expires_at').notNull(),
    executeBefore: tstz('execute_before'),
    sagaExpiresAt: tstz('saga_expires_at'),
    consumedAt: tstz('consumed_at'),
  },
  (t) => [
    check('consent_challenges_subject_type_ck', inList('subject_type', CONSENT_SUBJECT_TYPES)),
    check('consent_challenges_status_ck', inList('status', CHALLENGE_STATUSES)),
    check('consent_challenges_sha256_len_ck', sql`octet_length(snapshot_sha256) = 32`),
    check('consent_challenges_sms_send_count_ck', sql`sms_send_count >= 0 AND sms_send_count <= 3`),
    index('consent_challenges_investor_idx').on(t.investorId),
    index('consent_challenges_pending_expiry_idx').on(t.expiresAt).where(sql`status = 'PENDING'`),
    index('consent_challenges_consumed_execute_before_idx')
      .on(t.executeBefore)
      .where(sql`status = 'CONSUMED'`),
  ],
);

/**
 * Append-only evidence of a consent being given: either a CHALLENGE consent_records row (OTP-gated,
 * copied verbatim from the challenge at approve time so it survives the challenge's own later mutation)
 * or a DOCUMENT_ACCEPTANCE row (a checkbox acceptance with no OTP, for example KYC_CONSENT at ONB-02;
 * §0.4 item 4). Exactly one of (challengeId, documentKey) is set, matching `kind`.
 */
export const consentRecords = appSchema.table(
  'consent_records',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('consent_records')),
    createdAt: tstz('created_at').notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
    kind: text('kind', { enum: CONSENT_RECORD_KINDS }).notNull(),
    investorId: uuid('investor_id').notNull(),
    challengeId: uuid('challenge_id').unique('consent_records_challenge_id_uq'),
    subjectType: text('subject_type', { enum: CONSENT_SUBJECT_TYPES }),
    documentKey: text('document_key', { enum: LEGAL_DOCUMENT_KEYS }),
    subjectIds: jsonb('subject_ids').$type<Array<{ table: string; id: string }>>(),
    snapshotSha256: bytea('snapshot_sha256'),
    snapshotEnc: bytea('snapshot_enc'),
    /** Copied from the CONSENT otp_codes row(s) at approve time (template id, provider message id,
     * DLR status, timestamps, masked destination) so it survives the B2/D2 LOGIN/VERIFY_EMAIL-only
     * cleanup job (R-13). Null for a DOCUMENT_ACCEPTANCE row. */
    deliveryEvidence: jsonb('delivery_evidence'),
    channel: text('channel'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    sessionId: uuid('session_id'),
    consumedAt: tstz('consumed_at').notNull(),
    executeBefore: tstz('execute_before'),
    sagaExpiresAt: tstz('saga_expires_at'),
    firstAttemptAt: tstz('first_attempt_at'),
  },
  (t) => [
    check('consent_records_kind_ck', inList('kind', CONSENT_RECORD_KINDS)),
    check(
      'consent_records_kind_pair_ck',
      sql`(kind = 'CHALLENGE' AND challenge_id IS NOT NULL AND document_key IS NULL AND subject_type IS NOT NULL)
        OR (kind = 'DOCUMENT_ACCEPTANCE' AND challenge_id IS NULL AND document_key IS NOT NULL AND subject_type IS NULL)`,
    ),
    index('consent_records_investor_idx').on(t.investorId),
  ],
);

/**
 * Links one consent challenge to the concrete subject rows it covers (an order, a plan, a mandate, ...).
 * The row's own table is not created until the task that owns that subject exists (E20 for orders, F2
 * for plans and mandates); `subjectTable`/`subjectId` are a loose reference by design, checked by
 * `trg_consent_guard` (E4) once each subject table attaches it.
 */
export const consentSubjects = appSchema.table(
  'consent_subjects',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('consent_subjects')),
    createdAt: tstz('created_at').notNull().defaultNow(),
    challengeId: uuid('challenge_id')
      .notNull()
      .references(() => consentChallenges.id, { onDelete: 'restrict' }),
    subjectTable: text('subject_table').notNull(),
    subjectId: uuid('subject_id').notNull(),
    status: text('status', { enum: CONSENT_SUBJECT_ROW_STATUSES }).notNull().default('PENDING'),
  },
  (t) => [
    check('consent_subjects_status_ck', inList('status', CONSENT_SUBJECT_ROW_STATUSES)),
    unique('consent_subjects_challenge_subject_uq').on(t.challengeId, t.subjectTable, t.subjectId),
    index('consent_subjects_subject_idx').on(t.subjectTable, t.subjectId),
  ],
);
