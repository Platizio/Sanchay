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
