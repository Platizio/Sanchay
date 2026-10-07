import { index, integer, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { appSchema, bytea, dbUuidv7, tstz } from '../../db/app-schema.js';
import { newId } from '../../modules/platform/ids.js';

/**
 * Append-only (design SS C.1): UPDATE and DELETE are revoked from sanchay_app by the REVOKE line
 * appended at the bottom of this task's generated migration.
 */
export const providerCalls = appSchema.table(
  'provider_calls',
  {
    id: uuid('id')
      .primaryKey()
      .default(dbUuidv7)
      .$defaultFn(() => newId('provider_calls')),
    createdAt: tstz('created_at').notNull().defaultNow(),
    provider: text('provider').notNull(), // FpAudience: 'fp' | 'poa' | 'pg'
    operation: text('operation').notNull(), // FpOperationKey
    aggregateType: text('aggregate_type'),
    aggregateId: text('aggregate_id'),
    httpStatus: integer('http_status'),
    durationMs: integer('duration_ms').notNull(),
    errorCode: text('error_code'),
    requestMeta: jsonb('request_meta').$type<Record<string, unknown> | null>(),
    responseMeta: jsonb('response_meta').$type<Record<string, unknown> | null>(),
    bodyEnc: bytea('body_enc').notNull(),
  },
  (t) => [
    index('provider_calls_aggregate_idx').on(t.aggregateType, t.aggregateId),
    index('provider_calls_operation_idx').on(t.operation, t.createdAt),
  ],
);

export type ProviderCallRow = typeof providerCalls.$inferSelect;
export type NewProviderCall = typeof providerCalls.$inferInsert;
