import { sql } from 'drizzle-orm';
import { index, text, uuid } from 'drizzle-orm/pg-core';
import { appSchema, bytea, stdColumns, tstz } from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

export const pilotInvites = appSchema.table(
  'pilot_invites',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('pilot_invites')),
    ...stdColumns(),
    mobileBidx: bytea('mobile_bidx').notNull().unique('pilot_invites_mobile_bidx_uq'),
    invitedBy: text('invited_by').notNull(),
    note: text('note'),
    expiresAt: tstz('expires_at').notNull(),
    usedAt: tstz('used_at'),
  },
  (t) => [index('pilot_invites_live_idx').on(t.mobileBidx).where(sql`used_at IS NULL`)],
);
