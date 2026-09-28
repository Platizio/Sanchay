import { OTP_PURPOSES } from '@sanchay/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  authSessions,
  type InvestorStatus,
  investorContacts,
  investorDevices,
  investors,
  otpCodes,
} from '../../src/db/schema.js';
import { createTestDatabase, type TestDatabase } from './db.js';
import { insertDevice, insertInvestor, insertOtp, rnd } from './factories.js';
import { pgErrorCode } from './pg.js';

type DevicePlatform = (typeof investorDevices.$inferInsert)['platform'];
type OtpPurposeColumn = (typeof otpCodes.$inferInsert)['purpose'];

const H4_PURPOSES = [
  'LOGIN',
  'NEW_DEVICE_STEPUP',
  'EMAIL_FALLBACK_LOGIN',
  'VERIFY_EMAIL',
  'CONSENT',
  'CONTACT_CHANGE_OLD',
  'CONTACT_CHANGE_NEW',
  'REAUTH',
];

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDatabase();
});

afterAll(async () => {
  await t.drop();
});

describe('investors', () => {
  it('enforces a unique mobile blind index', async () => {
    const bidx = rnd();
    await insertInvestor(t.db, { mobileBidx: bidx });
    expect(await pgErrorCode(insertInvestor(t.db, { mobileBidx: bidx }))).toBe('23505');
  });

  it('checks status values', async () => {
    const bogus = 'DELETED' as string as InvestorStatus;
    expect(await pgErrorCode(insertInvestor(t.db, { status: bogus }))).toBe('23514');
  });

  it('restricts deleting an investor that has contacts', async () => {
    const inv = await insertInvestor(t.db);
    await t.db.insert(investorContacts).values({
      investorId: inv.id,
      kind: 'MOBILE',
      valueEnc: rnd(),
      valueBidx: rnd(),
      masked: '••••••3210',
      verifiedAt: new Date(),
      status: 'CURRENT',
    });
    // Deviation from brief (verified against live PostgreSQL 18): an explicit `onDelete: 'restrict'`
    // FK action raises 23001 (restrict_violation), not 23503 (foreign_key_violation, which applies
    // to the default NO ACTION whose check is deferred to end of statement).
    expect(await pgErrorCode(t.db.delete(investors).where(eq(investors.id, inv.id)))).toBe('23001');
  });
});

describe('investor_contacts', () => {
  it('allows one CURRENT contact per kind and any number of PREVIOUS ones', async () => {
    const inv = await insertInvestor(t.db);
    const base = {
      investorId: inv.id,
      kind: 'EMAIL' as const,
      valueEnc: rnd(),
      masked: 'r•••@example.com',
      verifiedAt: new Date(),
    };
    await t.db.insert(investorContacts).values({ ...base, valueBidx: rnd(), status: 'CURRENT' });
    await t.db.insert(investorContacts).values({ ...base, valueBidx: rnd(), status: 'PREVIOUS' });
    const third = t.db
      .insert(investorContacts)
      .values({ ...base, valueBidx: rnd(), status: 'CURRENT' });
    expect(await pgErrorCode(third)).toBe('23505');
  });
});

describe('investor_devices and auth_sessions', () => {
  it('keeps one device row per (investor, device ref)', async () => {
    const inv = await insertInvestor(t.db);
    const ref = rnd();
    await insertDevice(t.db, inv.id, { deviceRefHash: ref });
    expect(await pgErrorCode(insertDevice(t.db, inv.id, { deviceRefHash: ref }))).toBe('23505');
  });

  it('accepts WEB and ANDROID and rejects IOS (LAUNCH_CLIENT_PLATFORMS, D-19)', async () => {
    const inv = await insertInvestor(t.db);
    expect(await pgErrorCode(insertDevice(t.db, inv.id, { platform: 'ANDROID' }))).toBeUndefined();
    const ios = 'IOS' as string as DevicePlatform;
    expect(await pgErrorCode(insertDevice(t.db, inv.id, { platform: ios }))).toBe('23514');
  });

  it('requires revoke_reason exactly when revoked', async () => {
    const inv = await insertInvestor(t.db);
    const dev = await insertDevice(t.db, inv.id);
    const base = {
      investorId: inv.id,
      deviceId: dev.id,
      platform: 'WEB' as const,
      idleExpiresAt: new Date(Date.now() + 1_000),
      absoluteExpiresAt: new Date(Date.now() + 2_000),
    };
    const withoutReason = t.db
      .insert(authSessions)
      .values({ ...base, tokenHash: rnd(), revokedAt: new Date() });
    expect(await pgErrorCode(withoutReason)).toBe('23514');
    const withReason = t.db
      .insert(authSessions)
      .values({ ...base, tokenHash: rnd(), revokedAt: new Date(), revokeReason: 'LOGOUT' });
    expect(await pgErrorCode(withReason)).toBeUndefined();
  });
});

describe('otp_codes', () => {
  it('caps attempts at 5', async () => {
    expect(await pgErrorCode(insertOtp(t.db, { attempts: 6 }))).toBe('23514');
  });

  it('allows only one live code per (purpose, destination, reference)', async () => {
    const dest = rnd();
    await insertOtp(t.db, { destinationBidx: dest });
    expect(await pgErrorCode(insertOtp(t.db, { destinationBidx: dest }))).toBe('23505');
    await t.db
      .update(otpCodes)
      .set({ consumedAt: new Date(), consumedReason: 'SUPERSEDED' })
      .where(eq(otpCodes.destinationBidx, dest));
    expect(await pgErrorCode(insertOtp(t.db, { destinationBidx: dest }))).toBeUndefined();
    const withReference = insertOtp(t.db, {
      destinationBidx: dest,
      referenceId: '0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b',
    });
    expect(await pgErrorCode(withReference)).toBeUndefined();
  });

  it('requires consumed_reason exactly when consumed', async () => {
    expect(await pgErrorCode(insertOtp(t.db, { consumedAt: new Date() }))).toBe('23514');
  });

  it('accepts every H-4 purpose and rejects retired names', async () => {
    expect([...OTP_PURPOSES].sort()).toEqual([...H4_PURPOSES].sort());
    for (const purpose of OTP_PURPOSES) {
      expect(await pgErrorCode(insertOtp(t.db, { purpose }))).toBeUndefined();
    }
    const retired = 'EMAIL_VERIFY' as string as OtpPurposeColumn;
    expect(await pgErrorCode(insertOtp(t.db, { purpose: retired }))).toBe('23514');
  });

  it('requires destination_enc and pepper_kid (D-20)', async () => {
    const noDestination = insertOtp(t.db, { destinationEnc: null as unknown as Buffer });
    expect(await pgErrorCode(noDestination)).toBe('23502');
    const noPepperKid = insertOtp(t.db, { pepperKid: null as unknown as number });
    expect(await pgErrorCode(noPepperKid)).toBe('23502');
  });
});
