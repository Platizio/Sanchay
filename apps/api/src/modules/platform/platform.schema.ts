import { check, index, inet, jsonb, text, uuid } from 'drizzle-orm/pg-core';
import { appSchema, dbUuidv7, inList, tstz } from '../../db/app-schema.js';
import { newId } from './ids.js';

/** D-12: actor_type CHECK values. */
export const AUDIT_ACTOR_TYPES = ['INVESTOR', 'ADMIN', 'SYSTEM', 'ANONYMOUS'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
export type AuditValue = string | number | boolean | null;

/** Append-only (design §C.1): UPDATE and DELETE are revoked from sanchay_app in 0003_grants (Task B7). */
export const auditEvents = appSchema.table(
  'audit_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(dbUuidv7)
      .$defaultFn(() => newId('audit_events')),
    occurredAt: tstz('occurred_at').notNull().defaultNow(),
    actorType: text('actor_type', { enum: AUDIT_ACTOR_TYPES }).notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    requestId: text('request_id'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    data: jsonb('data').$type<Record<string, AuditValue>>().notNull().default({}),
    reason: text('reason'),
  },
  (t) => [
    check('audit_events_actor_type_ck', inList('actor_type', AUDIT_ACTOR_TYPES)),
    index('audit_events_entity_idx').on(t.entityType, t.entityId),
    index('audit_events_occurred_at_idx').on(t.occurredAt),
  ],
);
