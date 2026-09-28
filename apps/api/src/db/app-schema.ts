import { type SQL, sql } from 'drizzle-orm';
import { customType, integer, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

export const appSchema = pgSchema('app');

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const citext = customType<{ data: string; driverData: string }>({
  dataType: () => 'citext',
});

/** Design §C.1: timestamptz(6) only, never naive timestamps. */
export const tstz = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 6, mode: 'date' });

export const stdColumns = () => ({
  createdAt: tstz('created_at').notNull().defaultNow(),
  updatedAt: tstz('updated_at')
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  version: integer('version').notNull().default(0),
});

export const actorColumns = () => ({
  createdBy: text('created_by').notNull(),
  updatedBy: text('updated_by').notNull(),
});

/** DB-side id backstop. Used only on audit_events, auth_sessions and otp_codes. */
export const dbUuidv7 = sql`uuidv7()`;

/** CHECK (col IN (...)) built from code constants (never from user input). */
export function inList(column: string, values: readonly string[]): SQL {
  return sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(', ')})`);
}
