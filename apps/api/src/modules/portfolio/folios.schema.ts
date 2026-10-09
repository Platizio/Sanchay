import { check, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, appSchema, inList, stdColumns } from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

/** Minimal for E20; F4 (Plan 04) adds fp_holdings_snapshot, reconciliation_status and the rest of spec §2.3. */
export const FOLIO_STATUSES = ['PENDING', 'ACTIVE'] as const;

export const folios = appSchema.table(
  'folios',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => newId('folios')),
    ...stdColumns(),
    ...actorColumns(),
    investorId: uuid('investor_id').notNull(),
    amcId: uuid('amc_id').notNull(),
    folioNumber: text('folio_number'),
    status: text('status', { enum: FOLIO_STATUSES }).notNull().default('PENDING'),
  },
  () => [check('folios_status_ck', inList('status', FOLIO_STATUSES))],
);
