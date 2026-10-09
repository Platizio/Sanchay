import { RISK_LEVELS, RISKOMETER_LEVELS } from '@sanchay/domain';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  inet,
  integer,
  jsonb,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { appSchema, bytea, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { schemes } from '../catalogue/catalogue.schema.js';
import { investors } from '../identity/identity.schema.js';
import { newId } from '../platform/ids.js';

export const QUESTIONNAIRE_STATUSES = ['DRAFT', 'PUBLISHED', 'SUPERSEDED'] as const;
export const RISK_PROFILE_STATUSES = ['ACTIVE', 'STALE', 'EXPIRED', 'SUPERSEDED'] as const;
export const RISK_PROFILE_SOURCES = ['ONBOARDING', 'RETAKE'] as const;
export const SUITABILITY_OUTCOMES = ['MATCH', 'MISMATCH'] as const;

/** Compliance-owned questionnaire versions (R-36: published only with a named sign-off in `approved_by`). */
export const riskQuestionnaires = appSchema.table(
  'risk_questionnaires',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('risk_questionnaires')),
    ...stdColumns(),
    version: text('version').notNull().unique('risk_questionnaires_version_uq'),
    status: text('status', { enum: QUESTIONNAIRE_STATUSES }).notNull().default('DRAFT'),
    questionsAndScoring: jsonb('questions_and_scoring').notNull(),
    sha256: bytea('sha256').notNull(),
    effectiveAt: tstz('effective_at'),
    approvedBy: text('approved_by'),
  },
  () => [check('risk_questionnaires_status_ck', inList('status', QUESTIONNAIRE_STATUSES))],
);

/**
 * Not grant-revoked (unlike consent_records / audit_events): `status` moves ACTIVE -> STALE / EXPIRED /
 * SUPERSEDED in place after insert. The answers, score and level never change.
 */
export const riskProfiles = appSchema.table(
  'risk_profiles',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('risk_profiles')),
    createdAt: tstz('created_at').notNull().defaultNow(),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => investors.id, { onDelete: 'restrict' }),
    questionnaireId: uuid('questionnaire_id')
      .notNull()
      .references(() => riskQuestionnaires.id, { onDelete: 'restrict' }),
    answers: jsonb('answers').notNull(),
    rawScore: smallint('raw_score').notNull(),
    caps: jsonb('caps').$type<string[]>().notNull(),
    level: text('level', { enum: RISK_LEVELS }).notNull(),
    maxRiskometer: text('max_riskometer', { enum: RISKOMETER_LEVELS }).notNull(),
    status: text('status', { enum: RISK_PROFILE_STATUSES }).notNull().default('ACTIVE'),
    completedAt: tstz('completed_at').notNull(),
    expiresAt: tstz('expires_at').notNull(),
    source: text('source', { enum: RISK_PROFILE_SOURCES }).notNull(),
    ip: inet('ip'),
    ua: text('ua'),
  },
  (t) => [
    check('risk_profiles_level_ck', inList('level', RISK_LEVELS)),
    check('risk_profiles_max_riskometer_ck', inList('max_riskometer', RISKOMETER_LEVELS)),
    check('risk_profiles_status_ck', inList('status', RISK_PROFILE_STATUSES)),
    check('risk_profiles_source_ck', inList('source', RISK_PROFILE_SOURCES)),
    check('risk_profiles_score_ck', sql`raw_score BETWEEN 8 AND 32`),
    index('risk_profiles_investor_completed_idx').on(t.investorId, t.completedAt),
    // At most one ACTIVE profile per investor (a double-submit race cannot leave two).
    uniqueIndex('risk_profiles_one_active_uq').on(t.investorId).where(sql`status = 'ACTIVE'`),
  ],
);

/**
 * One row per suitability evaluation, MATCH rows included. `order_id` references `orders` through
 * `suitability_checks_order_id_orders_id_fk`, added by E20's 0030_orders_guard. `plan_id` carries no FK yet:
 * `plans` does not exist until F2, which adds its own `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`.
 */
export const suitabilityChecks = appSchema.table(
  'suitability_checks',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('suitability_checks')),
    ...stdColumns(),
    orderId: uuid('order_id'),
    planId: uuid('plan_id'),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => schemes.id, { onDelete: 'restrict' }),
    schemeRiskometer: text('scheme_riskometer', { enum: RISKOMETER_LEVELS }).notNull(),
    fundFactsAsOf: tstz('fund_facts_as_of').notNull(),
    riskProfileId: uuid('risk_profile_id')
      .notNull()
      .references(() => riskProfiles.id, { onDelete: 'restrict' }),
    level: text('level', { enum: RISK_LEVELS }).notNull(),
    outcome: text('outcome', { enum: SUITABILITY_OUTCOMES }).notNull(),
  },
  () => [
    check(
      'suitability_checks_scheme_riskometer_ck',
      inList('scheme_riskometer', RISKOMETER_LEVELS),
    ),
    check('suitability_checks_level_ck', inList('level', RISK_LEVELS)),
    check('suitability_checks_outcome_ck', inList('outcome', SUITABILITY_OUTCOMES)),
    check('suitability_checks_subject_ck', sql`order_id IS NOT NULL OR plan_id IS NOT NULL`),
  ],
);

/** Immutable (UPDATE / DELETE revoked from sanchay_app in the guards migration). */
export const suitabilityAcknowledgements = appSchema.table('suitability_acknowledgements', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => newId('suitability_acknowledgements')),
  createdAt: tstz('created_at').notNull().defaultNow(),
  checkId: uuid('check_id')
    .notNull()
    .references(() => suitabilityChecks.id, { onDelete: 'restrict' }),
  warningDocKey: text('warning_doc_key').notNull(),
  warningDocVersion: integer('warning_doc_version').notNull(),
  warningDocSha256: bytea('warning_doc_sha256').notNull(),
  renderedTextSha256: bytea('rendered_text_sha256').notNull(),
  checkboxAt: tstz('checkbox_at').notNull(),
  challengeId: uuid('challenge_id').notNull(),
  consentRecordId: uuid('consent_record_id'),
  otpVerifiedAt: tstz('otp_verified_at'),
  noticeDeliveryId: uuid('notice_delivery_id'),
});
