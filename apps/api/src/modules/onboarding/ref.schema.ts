import { char, text, uuid } from 'drizzle-orm/pg-core';
import { appSchema, stdColumns } from '../../db/app-schema.js';
import { newId } from '../platform/ids.js';

export const refPincodes = appSchema.table('ref_pincodes', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => newId('ref_pincodes')),
  ...stdColumns(),
  pincode: char('pincode', { length: 6 }).notNull().unique('ref_pincodes_pincode_uq'),
  city: text('city').notNull(),
  state: text('state').notNull(),
});

export const refIfsc = appSchema.table('ref_ifsc', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => newId('ref_ifsc')),
  ...stdColumns(),
  ifsc: text('ifsc').notNull().unique('ref_ifsc_ifsc_uq'),
  bankName: text('bank_name').notNull(),
  branchName: text('branch_name').notNull(),
});
