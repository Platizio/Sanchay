import { sql } from 'drizzle-orm';
import { check, index, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import { appSchema, bytea, inList, stdColumns } from '../../db/app-schema.js';
import { investors } from '../identity/identity.schema.js';
import { newId } from '../platform/ids.js';

export const NOTIFICATION_CATEGORIES = [
  'SECURITY',
  'ORDER',
  'SIP',
  'MANDATE',
  'SUITABILITY',
  'ONBOARDING',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_TEMPLATE_KEYS = [
  'SECURITY_NEW_SIGN_IN',
  'ORDER_PLACED',
  'ORDER_ALLOTTED',
  'ORDER_FAILED',
  'REFUND_IN_PROGRESS',
  'REDEMPTION_PROCESSED',
  'PAYOUT_DELAYED',
  'SIP_ACTIVE',
  'SIP_INSTALMENT_MISSED_WARNING',
  'MANDATE_STATUS',
  'MANDATE_REVOKED',
  'SUITABILITY_WARNING_COPY',
  'ONBOARDING_BLOCKED_PILOT',
] as const;
export type NotificationTemplateKey = (typeof NOTIFICATION_TEMPLATE_KEYS)[number];

export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const NOTIFICATION_DELIVERY_CHANNELS = ['EMAIL'] as const;
export type NotificationDeliveryChannel = (typeof NOTIFICATION_DELIVERY_CHANNELS)[number];

export const NOTIFICATION_DELIVERY_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
export type NotificationDeliveryStatus = (typeof NOTIFICATION_DELIVERY_STATUSES)[number];

export const notifications = appSchema.table(
  'notifications',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('notifications')),
    ...stdColumns(),
    investorId: uuid('investor_id')
      .notNull()
      .references(() => investors.id, { onDelete: 'restrict' }),
    category: text('category', { enum: NOTIFICATION_CATEGORIES }).notNull(),
    templateKey: text('template_key', { enum: NOTIFICATION_TEMPLATE_KEYS }).notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    payloadEnc: bytea('payload_enc').notNull(),
    status: text('status', { enum: NOTIFICATION_STATUSES }).notNull().default('PENDING'),
  },
  (t) => [
    check('notifications_category_ck', inList('category', NOTIFICATION_CATEGORIES)),
    check('notifications_template_key_ck', inList('template_key', NOTIFICATION_TEMPLATE_KEYS)),
    check('notifications_status_ck', inList('status', NOTIFICATION_STATUSES)),
    unique('notifications_dedupe_uq').on(t.dedupeKey),
    index('notifications_investor_idx').on(t.investorId, t.createdAt),
  ],
);

export const notificationDeliveries = appSchema.table(
  'notification_deliveries',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('notification_deliveries')),
    ...stdColumns(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'restrict' }),
    channel: text('channel', { enum: NOTIFICATION_DELIVERY_CHANNELS }).notNull().default('EMAIL'),
    providerMessageId: text('provider_message_id'),
    status: text('status', { enum: NOTIFICATION_DELIVERY_STATUSES }).notNull().default('PENDING'),
    attempts: smallint('attempts').notNull().default(0),
  },
  (t) => [
    check('notification_deliveries_channel_ck', inList('channel', NOTIFICATION_DELIVERY_CHANNELS)),
    check('notification_deliveries_status_ck', inList('status', NOTIFICATION_DELIVERY_STATUSES)),
    check('notification_deliveries_attempts_ck', sql`attempts >= 0`),
    index('notification_deliveries_notification_idx').on(t.notificationId),
  ],
);
