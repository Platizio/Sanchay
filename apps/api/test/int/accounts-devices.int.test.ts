import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { investorContacts, investorDevices } from '../../src/db/schema.js';
import { DeviceRegistry } from '../../src/modules/identity/device-registry.service.js';
import { InvestorAccounts } from '../../src/modules/identity/investor-accounts.service.js';
import { FakeClock, MINUTE } from '../../src/modules/platform/clock.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { AppError } from '../../src/modules/platform/errors.js';
import { createTestDatabase, type TestDatabase } from './db.js';
import { testEnv, testKeyService } from './env.js';
import { pgErrorCode } from './pg.js';

let t: TestDatabase;
let accounts: InvestorAccounts;
let devices: DeviceRegistry;
let crypto: Crypto;
const clock = new FakeClock();

beforeAll(async () => {
  t = await createTestDatabase();
  crypto = new Crypto(testKeyService(testEnv(t.url)));
  accounts = new InvestorAccounts(crypto, clock);
  devices = new DeviceRegistry(clock);
});

afterAll(async () => {
  await t.drop();
});

const fieldCode = (e: unknown): string | undefined =>
  e instanceof AppError ? e.options?.fields?.[0]?.code : undefined;

describe('InvestorAccounts', () => {
  it('creates an investor with encrypted mobile, blind index and a CURRENT contact', async () => {
    const inv = await accounts.createWithVerifiedMobile(t.db, '9876500001');
    expect(inv).toMatchObject({
      status: 'ACTIVE',
      mobileLast4: '0001',
      createdBy: `investor:${inv.id}`,
      mobileVerifiedAt: clock.now(),
    });
    expect(accounts.decryptMobile(inv)).toBe('9876500001');
    expect(inv.mobileEnc.toString('utf8')).not.toContain('9876500001');
    expect(inv.mobileBidx.equals(crypto.blindIndex('mobile', '9876500001'))).toBe(true);
    const [contact] = await t.db
      .select()
      .from(investorContacts)
      .where(eq(investorContacts.investorId, inv.id));
    expect(contact).toMatchObject({ kind: 'MOBILE', status: 'CURRENT', masked: '••••••0001' });
    expect((await accounts.findByMobile(t.db, '9876500001'))?.id).toBe(inv.id);
    expect(await accounts.findByMobile(t.db, '9876500999')).toBeNull();
  });

  it('refuses a second investor with the same mobile (unique blind index)', async () => {
    await accounts.createWithVerifiedMobile(t.db, '9876500002');
    expect(await pgErrorCode(accounts.createWithVerifiedMobile(t.db, '9876500002'))).toBe('23505');
  });

  it('verifies an email once, keeps one CURRENT email contact, and rejects duplicates', async () => {
    const a = await accounts.createWithVerifiedMobile(t.db, '9876500003');
    const b = await accounts.createWithVerifiedMobile(t.db, '9876500004');
    const res = await accounts.setVerifiedEmail(t.db, a.id, 'Ravi@Example.com');
    expect(res).toEqual({ emailMasked: 'r•••@example.com', emailVerifiedAt: clock.now() });
    const reloaded = await accounts.findById(t.db, a.id);
    expect(reloaded && accounts.decryptEmail(reloaded)).toBe('ravi@example.com');
    expect(reloaded?.version).toBe(1);
    const emails = await t.db
      .select()
      .from(investorContacts)
      .where(and(eq(investorContacts.investorId, a.id), eq(investorContacts.kind, 'EMAIL')));
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ status: 'CURRENT', masked: 'r•••@example.com' });

    const inUse = await accounts.setVerifiedEmail(t.db, b.id, 'ravi@example.com').then(
      () => null,
      (e: unknown) => e,
    );
    expect(inUse).toBeInstanceOf(AppError);
    expect((inUse as AppError).code).toBe('VALIDATION_FAILED');
    expect(fieldCode(inUse)).toBe('EMAIL_IN_USE');

    const again = await accounts.assertEmailAvailable(t.db, a.id, 'other@example.com').then(
      () => null,
      (e: unknown) => e,
    );
    expect(fieldCode(again)).toBe('EMAIL_ALREADY_VERIFIED');
  });
});

describe('DeviceRegistry', () => {
  it('inserts a device once, then refreshes the same row', async () => {
    const inv = await accounts.createWithVerifiedMobile(t.db, '9876500005');
    const ref = Buffer.alloc(32, 7);
    const first = await devices.upsert(t.db, inv.id, {
      platform: 'ANDROID',
      refHash: ref,
      appVersion: '1.0.0',
    });
    expect(first.isNew).toBe(true);
    expect(first.device).toMatchObject({
      investorId: inv.id,
      platform: 'ANDROID',
      appVersion: '1.0.0',
      lastSeenAt: clock.now(),
      revokedAt: null,
    });

    clock.advance(5 * MINUTE);
    const second = await devices.upsert(t.db, inv.id, {
      platform: 'ANDROID',
      refHash: ref,
      appVersion: '1.0.1',
    });
    expect(second.isNew).toBe(false);
    expect(second.device.id).toBe(first.device.id);
    expect(second.device.appVersion).toBe('1.0.1');
    expect(second.device.lastSeenAt).toEqual(clock.now());
    const rows = await t.db
      .select()
      .from(investorDevices)
      .where(eq(investorDevices.investorId, inv.id));
    expect(rows).toHaveLength(1);
  });

  it('treats another device ref, or the same ref for another investor, as new', async () => {
    const a = await accounts.createWithVerifiedMobile(t.db, '9876500006');
    const b = await accounts.createWithVerifiedMobile(t.db, '9876500007');
    const ref = Buffer.alloc(32, 9);
    const aFirst = await devices.upsert(t.db, a.id, {
      platform: 'WEB',
      refHash: ref,
      appVersion: null,
    });
    const aOther = await devices.upsert(t.db, a.id, {
      platform: 'WEB',
      refHash: Buffer.alloc(32, 10),
      appVersion: null,
    });
    const bSame = await devices.upsert(t.db, b.id, {
      platform: 'WEB',
      refHash: ref,
      appVersion: null,
    });
    expect([aFirst.isNew, aOther.isNew, bSame.isNew]).toEqual([true, true, true]);
    expect(new Set([aFirst.device.id, aOther.device.id, bSame.device.id]).size).toBe(3);
  });

  it('re-registers a revoked device as new and clears revoked_at', async () => {
    const inv = await accounts.createWithVerifiedMobile(t.db, '9876500008');
    const ref = Buffer.alloc(32, 11);
    const first = await devices.upsert(t.db, inv.id, {
      platform: 'ANDROID',
      refHash: ref,
      appVersion: '1.0.0',
    });
    await t.db
      .update(investorDevices)
      .set({ revokedAt: clock.now() })
      .where(eq(investorDevices.id, first.device.id));
    const again = await devices.upsert(t.db, inv.id, {
      platform: 'ANDROID',
      refHash: ref,
      appVersion: '1.0.0',
    });
    expect(again.isNew).toBe(true);
    expect(again.device.id).toBe(first.device.id);
    expect(again.device.revokedAt).toBeNull();
  });
});
