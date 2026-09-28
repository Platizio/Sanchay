import { randomBytes } from 'node:crypto';
import type { Database } from '../../src/db/client.js';
import { investorDevices, investors, otpCodes } from '../../src/db/schema.js';

export const rnd = (n = 32): Buffer => randomBytes(n);

export async function insertInvestor(
  db: Database,
  overrides: Partial<typeof investors.$inferInsert> = {},
) {
  const [row] = await db
    .insert(investors)
    .values({
      createdBy: 'system:test',
      updatedBy: 'system:test',
      mobileEnc: rnd(48),
      mobileBidx: rnd(),
      mobileLast4: '3210',
      mobileVerifiedAt: new Date(),
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('insertInvestor: no row returned');
  return row;
}

export async function insertDevice(
  db: Database,
  investorId: string,
  overrides: Partial<typeof investorDevices.$inferInsert> = {},
) {
  const [row] = await db
    .insert(investorDevices)
    .values({ investorId, platform: 'WEB', deviceRefHash: rnd(), ...overrides })
    .returning();
  if (!row) throw new Error('insertDevice: no row returned');
  return row;
}

export async function insertOtp(
  db: Database,
  overrides: Partial<typeof otpCodes.$inferInsert> = {},
) {
  const [row] = await db
    .insert(otpCodes)
    .values({
      purpose: 'LOGIN',
      channel: 'SMS',
      destinationEnc: rnd(48),
      destinationBidx: rnd(),
      destinationMasked: '••••••3210',
      codeHmac: rnd(),
      pepperKid: 1,
      expiresAt: new Date(Date.now() + 300_000),
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('insertOtp: no row returned');
  return row;
}
