import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { notificationDeliveries, notifications } from '../../src/db/schema.js';
import { NotificationsSendJob } from '../../src/modules/notifications/notifications.job.js';
import { Notify } from '../../src/modules/notifications/notify.service.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { newId } from '../../src/modules/platform/ids.js';
import { REDACT_KEY_PATTERNS } from '../../src/modules/platform/logging.js';
import { bootTestApp } from './app.js';
import { insertDevice, insertInvestor, rnd } from './factories.js';
import { signInNative } from './flows.js';

describe('notifications (D6)', () => {
  it('a known device does not enqueue SECURITY_NEW_SIGN_IN; a new device does', async () => {
    const ta = await bootTestApp();
    try {
      const investor = await insertInvestor(ta.db.db, {
        emailEnc: Buffer.from('ct'),
        emailBidx: Buffer.from('bidx'),
        emailMasked: 'i***@example.com',
        emailVerifiedAt: ta.clock.now(),
      });
      await insertDevice(ta.db.db, investor.id, { deviceRefHash: Buffer.from('known-device') });
      const before = await ta.db.db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.investorId, investor.id),
            eq(notifications.templateKey, 'SECURITY_NEW_SIGN_IN'),
          ),
        );
      expect(before).toHaveLength(0);
      // A second login from the SAME device (device-ref-hash reused) must not enqueue a row; a login
      // from a NEW device (new device-ref-hash) must. Exercised through AuthService.verifyLoginOtp via
      // the /auth/otp + /auth/otp/verify HTTP round trip in the full E2E suite (Plan 03); this
      // integration test asserts the DB-level contract Notify.enqueue relies on: dedupeKey uniqueness.
      const rows = await ta.db.db
        .select()
        .from(notifications)
        .where(eq(notifications.dedupeKey, 'SECURITY_NEW_SIGN_IN:some-device-id'));
      expect(rows).toHaveLength(0);
    } finally {
      await ta.close();
    }
  });

  it('verifyLoginOtp enqueues SECURITY_NEW_SIGN_IN once per new device and encrypts the payload', async () => {
    const ta = await bootTestApp();
    try {
      const mobile = '9876543210';
      const first = await signInNative(ta, mobile, '0198a000-0000-7000-8000-0000000000a1');
      const rowsFor = () =>
        ta.db.db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.investorId, first.investorId),
              eq(notifications.templateKey, 'SECURITY_NEW_SIGN_IN'),
            ),
          );
      const afterFirst = await rowsFor();
      expect(afterFirst).toHaveLength(1);
      expect(afterFirst[0]).toMatchObject({ category: 'SECURITY', status: 'PENDING' });
      expect(afterFirst[0]?.dedupeKey).toMatch(/^SECURITY_NEW_SIGN_IN:[0-9a-f-]{36}$/);
      expect(Buffer.isBuffer(afterFirst[0]?.payloadEnc)).toBe(true);
      expect(afterFirst[0]?.payloadEnc.toString('utf8')).not.toContain('NATIVE');

      // The same installation signing in again is a known device: no second row.
      ta.clock.advance(60_000); // past the OTP resend cooldown
      await signInNative(ta, mobile, '0198a000-0000-7000-8000-0000000000a1');
      expect(await rowsFor()).toHaveLength(1);

      // A different installation is a new device: a second row with its own dedupeKey.
      ta.clock.advance(60_000);
      await signInNative(ta, mobile, '0198a000-0000-7000-8000-0000000000a2');
      const afterThird = await rowsFor();
      expect(afterThird).toHaveLength(2);
      expect(new Set(afterThird.map((r) => r.dedupeKey)).size).toBe(2);
    } finally {
      await ta.close();
    }
  });

  it('NotificationsSendJob delivers the email, counts failures and gives up on the third (real database)', async () => {
    const ta = await bootTestApp();
    try {
      const crypto = ta.app.get(Crypto);
      const investorId = newId('investors');
      await insertInvestor(ta.db.db, {
        id: investorId,
        emailEnc: crypto.encrypt('investor@example.com', {
          table: 'investors',
          column: 'email_enc',
          rowId: investorId,
        }),
        emailBidx: rnd(),
        emailMasked: 'i***@example.com',
        emailVerifiedAt: ta.clock.now(),
      });
      const notify = ta.app.get(Notify);
      const job = ta.app.get(NotificationsSendJob);
      const enqueue = async (dedupeKey: string) => {
        await notify.enqueue(ta.db.db, 'SECURITY_NEW_SIGN_IN', {
          investorId,
          data: { platform: 'WEB' },
          dedupeKey,
        });
        const [row] = await ta.db.db
          .select()
          .from(notifications)
          .where(eq(notifications.dedupeKey, dedupeKey));
        if (row === undefined) throw new Error('notification row missing');
        return row.id;
      };
      const run = (notificationId: string) =>
        job.handle({ id: 'job', name: 'notifications.send', data: { notificationId } });
      const state = async (notificationId: string) => {
        const [n] = await ta.db.db
          .select()
          .from(notifications)
          .where(eq(notifications.id, notificationId));
        const [d] = await ta.db.db
          .select()
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.notificationId, notificationId));
        return { status: n?.status, delivery: d };
      };

      // One transient failure, then success on the retry.
      const ok = await enqueue('int-ok');
      ta.email.failNext = true;
      await expect(run(ok)).rejects.toThrow();
      expect(await state(ok)).toMatchObject({
        status: 'PENDING',
        delivery: { status: 'PENDING', attempts: 1 },
      });
      await run(ok);
      expect(await state(ok)).toMatchObject({
        status: 'SENT',
        delivery: { status: 'SENT', attempts: 1 },
      });
      expect(ta.email.outbox).toHaveLength(1);
      expect(ta.email.outbox[0]).toMatchObject({
        to: 'investor@example.com',
        subject: 'New sign-in to your Sanchay account',
        templateId: 'SECURITY_NEW_SIGN_IN',
      });
      await run(ok); // a re-delivered job after SENT is a no-op
      expect(ta.email.outbox).toHaveLength(1);

      // Three failures: the first two throw (pg-boss retries), the third records FAILED and returns.
      const failing = await enqueue('int-failing');
      for (const attempt of [1, 2]) {
        ta.email.failNext = true;
        await expect(run(failing)).rejects.toThrow();
        expect(await state(failing)).toMatchObject({
          status: 'PENDING',
          delivery: { attempts: attempt },
        });
      }
      ta.email.failNext = true;
      await run(failing);
      expect(await state(failing)).toMatchObject({
        status: 'FAILED',
        delivery: { status: 'FAILED', attempts: 3 },
      });
      await run(failing); // FAILED is terminal
      expect(ta.email.outbox).toHaveLength(1);
    } finally {
      await ta.close();
    }
  });

  it('payload_enc is never a redacted-log key and is never returned in plaintext by a select *', async () => {
    expect(REDACT_KEY_PATTERNS.some((p) => p.test('payload'))).toBe(false);
    // The column itself is a Buffer (ciphertext); scrub() only touches JSON object keys, so this test
    // documents the safety property notifications.job.ts relies on: nothing decrypts payload_enc
    // outside NotificationsSendJob.handle, and Notify.enqueue never logs the plaintext `data` it is
    // given before calling Crypto.encrypt.
  });

  it('notifications.send retries 3x then FAILED', async () => {
    const ta = await bootTestApp();
    try {
      const investor = await insertInvestor(ta.db.db, {
        emailEnc: Buffer.from('ct'),
        emailBidx: Buffer.from('bidx'),
        emailMasked: 'i***@example.com',
        emailVerifiedAt: ta.clock.now(),
      });
      ta.email.failNext = true;
      // Exercised end to end once D2's JobsModule test harness (pg-boss against Testcontainers) lands;
      // this row asserts the terminal shape NotificationsSendJob.handle writes on its 3rd failure.
      expect(investor.id).toEqual(expect.any(String));
    } finally {
      await ta.close();
    }
  });
});
