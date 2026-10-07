import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { appSchema, bytea, dbUuidv7, inList, stdColumns, tstz } from '../../db/app-schema.js';
import { newId } from './ids.js';

export const IDEMPOTENCY_STATUSES = ['IN_PROGRESS', 'COMPLETED'] as const;
export type IdempotencyStatus = (typeof IDEMPOTENCY_STATUSES)[number];

/**
 * PK is (actor_id, key), never a synthetic id: an Idempotency-Key is only ever reused within one
 * actor's own retries (D1 test "keys are per actor"), so the natural key is the lookup key too.
 */
export const idempotencyKeys = appSchema.table(
  'idempotency_keys',
  {
    actorId: text('actor_id').notNull(),
    key: uuid('key').notNull(),
    route: text('route').notNull(),
    requestSha256: bytea('request_sha256').notNull(),
    status: text('status', { enum: IDEMPOTENCY_STATUSES }).notNull().default('IN_PROGRESS'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body').$type<unknown>(),
    createdAt: tstz('created_at').notNull().defaultNow(),
    expiresAt: tstz('expires_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.actorId, t.key] }),
    check('idempotency_keys_status_ck', inList('status', IDEMPOTENCY_STATUSES)),
    check(
      'idempotency_keys_response_pair_ck',
      sql`(response_status IS NULL) = (response_body IS NULL)`,
    ),
    check(
      'idempotency_keys_completed_has_response_ck',
      sql`status = 'IN_PROGRESS' OR response_status IS NOT NULL`,
    ),
    index('idempotency_keys_expires_at_idx').on(t.expiresAt),
  ],
);

/** RuntimeConfig's backing store (runtime-config.ts). One row per typed key; missing row = the default. */
export const appConfig = appSchema.table('app_config', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedAt: tstz('updated_at').notNull().defaultNow(),
});

export const RECON_BREAK_SEVERITIES = ['WARNING', 'CRITICAL'] as const;
export type ReconBreakSeverity = (typeof RECON_BREAK_SEVERITIES)[number];
export const RECON_BREAK_STATUSES = ['OPEN', 'RESOLVED'] as const;
export type ReconBreakStatus = (typeof RECON_BREAK_STATUSES)[number];

export const reconBreaks = appSchema.table(
  'recon_breaks',
  {
    id: uuid('id')
      .primaryKey()
      .default(dbUuidv7)
      .$defaultFn(() => newId('recon_breaks')),
    ...stdColumns(),
    kind: text('kind').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    severity: text('severity', { enum: RECON_BREAK_SEVERITIES }).notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status', { enum: RECON_BREAK_STATUSES }).notNull().default('OPEN'),
    resolvedAt: tstz('resolved_at'),
  },
  (t) => [
    check('recon_breaks_severity_ck', inList('severity', RECON_BREAK_SEVERITIES)),
    check('recon_breaks_status_ck', inList('status', RECON_BREAK_STATUSES)),
    check('recon_breaks_resolved_pair_ck', sql`(status = 'RESOLVED') = (resolved_at IS NOT NULL)`),
    uniqueIndex('recon_breaks_open_uq').on(t.kind, t.entityId).where(sql`status <> 'RESOLVED'`),
  ],
);
