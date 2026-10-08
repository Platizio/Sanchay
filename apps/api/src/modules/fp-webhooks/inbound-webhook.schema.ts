import { boolean, check, index, integer, text, unique, uuid } from 'drizzle-orm/pg-core';
import { appSchema, bytea, inList, tstz } from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

export const WEBHOOK_PROVIDERS = ['FP'] as const;
export type WebhookProvider = (typeof WEBHOOK_PROVIDERS)[number];

export const WEBHOOK_SIGNATURE_MODES = ['HMAC', 'SHARED_SECRET', 'NONE'] as const;
export type WebhookSignatureMode = (typeof WEBHOOK_SIGNATURE_MODES)[number];

export const WEBHOOK_EVENT_STATUSES = ['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED'] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

/**
 * Append-only in spirit (nothing UPDATEs the payload once written); attempts/status/lastError/
 * processedAt do change as fp.event.process retries, so this table keeps normal UPDATE grants
 * (unlike audit_events) rather than being added to the append-only REVOKE list.
 */
export const inboundWebhookEvents = appSchema.table(
  'inbound_webhook_events',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('inbound_webhook_events')),
    provider: text('provider', { enum: WEBHOOK_PROVIDERS }).notNull(),
    eventId: text('event_id').notNull(),
    eventType: text('event_type').notNull(),
    objectType: text('object_type'),
    objectId: text('object_id'),
    signatureMode: text('signature_mode', { enum: WEBHOOK_SIGNATURE_MODES }).notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    /** Null when signatureValid is false: an unverified body is never decrypted/stored. */
    payloadEnc: bytea('payload_enc'),
    payloadSha256: bytea('payload_sha256').notNull(),
    status: text('status', { enum: WEBHOOK_EVENT_STATUSES }).notNull().default('RECEIVED'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    receivedAt: tstz('received_at').notNull().defaultNow(),
    processedAt: tstz('processed_at'),
  },
  (t) => [
    unique('inbound_webhook_events_provider_event_uq').on(t.provider, t.eventId),
    check(
      'inbound_webhook_events_signature_mode_ck',
      inList('signature_mode', WEBHOOK_SIGNATURE_MODES),
    ),
    check('inbound_webhook_events_status_ck', inList('status', WEBHOOK_EVENT_STATUSES)),
    index('inbound_webhook_events_status_idx').on(t.status),
  ],
);
