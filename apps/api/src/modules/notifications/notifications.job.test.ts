import { describe, expect, it, vi } from 'vitest';
import { NotificationsSendJob } from './notifications.job.js';

const NOTIFICATION_ID = '0198a000-0000-7000-8000-000000000001';
const INVESTOR_ID = '0198a000-0000-7000-8000-000000000002';
const DELIVERY_ID = '0198a000-0000-7000-8000-000000000003';
const now = new Date('2026-10-19T04:30:00.000Z');

interface Harness {
  job: NotificationsSendJob;
  email: { send: ReturnType<typeof vi.fn> };
  updates: Array<Record<string, unknown>>;
  inserts: Array<Record<string, unknown>>;
}

/**
 * The job reads in a fixed order: the notification, the investor, then the delivery row (absent on the
 * first attempt). Each select resolves the next scripted result; writes are recorded.
 */
function harness(options: {
  emailVerifiedAt?: Date | null;
  priorAttempts?: number;
  send: () => Promise<{ provider: 'SES'; messageId: string }>;
}): Harness {
  const notificationRow = {
    id: NOTIFICATION_ID,
    investorId: INVESTOR_ID,
    templateKey: 'SECURITY_NEW_SIGN_IN',
    status: 'PENDING',
    payloadEnc: Buffer.from('ct'),
  };
  const investorRow = {
    id: INVESTOR_ID,
    emailEnc: Buffer.from('ct'),
    emailVerifiedAt: options.emailVerifiedAt === undefined ? now : options.emailVerifiedAt,
  };
  const deliveryRow =
    options.priorAttempts === undefined
      ? undefined
      : { id: DELIVERY_ID, notificationId: NOTIFICATION_ID, attempts: options.priorAttempts };
  const reads: unknown[][] = [
    [notificationRow],
    [investorRow],
    deliveryRow === undefined ? [] : [deliveryRow],
  ];
  const updates: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const db = {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(reads.shift() ?? []) }) }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        inserts.push(row);
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: () => Promise.resolve() };
      },
    }),
  };
  const email = { send: vi.fn(options.send) };
  const crypto = {
    decrypt: (_ct: Buffer, aad: { column: string }) =>
      aad.column === 'email_enc' ? 'investor@example.com' : JSON.stringify({ platform: 'WEB' }),
  };
  const job = new NotificationsSendJob(
    { db } as never,
    crypto as never,
    { now: () => now } as never,
    email as never,
  );
  return { job, email, updates, inserts };
}

const run = (h: Harness) =>
  h.job.handle({
    id: 'job-1',
    name: 'notifications.send',
    data: { notificationId: NOTIFICATION_ID },
  });

const smtpDown = () => Promise.reject(new Error('smtp down'));

describe('NotificationsSendJob', () => {
  it('retries three times then marks the delivery and notification FAILED', async () => {
    // First attempt: no delivery row yet; the failure is counted and rethrown so pg-boss retries.
    const first = harness({ send: smtpDown });
    await expect(run(first)).rejects.toThrow('smtp down');
    expect(first.inserts).toHaveLength(1);
    expect(first.updates).toEqual([{ attempts: 1, updatedAt: now }]);

    // Second attempt: counted, rethrown, the notification stays PENDING.
    const second = harness({ priorAttempts: 1, send: smtpDown });
    await expect(run(second)).rejects.toThrow('smtp down');
    expect(second.updates).toEqual([{ attempts: 2, updatedAt: now }]);

    // Third attempt: the job gives up, so pg-boss sees a success and stops retrying.
    const third = harness({ priorAttempts: 2, send: smtpDown });
    await expect(run(third)).resolves.toBeUndefined();
    expect(third.updates).toEqual([
      { status: 'FAILED', attempts: 3, updatedAt: now },
      { status: 'FAILED', updatedAt: now },
    ]);
  });

  it('sends the rendered email to the decrypted address and marks both rows SENT', async () => {
    const h = harness({ send: () => Promise.resolve({ provider: 'SES', messageId: 'ses-1' }) });
    await run(h);
    expect(h.email.send).toHaveBeenCalledOnce();
    expect(h.email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'investor@example.com',
        subject: 'New sign-in to your Sanchay account',
        templateId: 'SECURITY_NEW_SIGN_IN',
      }),
    );
    expect(h.updates).toEqual([
      { status: 'SENT', providerMessageId: 'ses-1', updatedAt: now },
      { status: 'SENT', updatedAt: now },
    ]);
  });

  it('skips the notification when the investor has no verified email, without sending', async () => {
    const h = harness({ emailVerifiedAt: null, send: smtpDown });
    await run(h);
    expect(h.email.send).not.toHaveBeenCalled();
    expect(h.updates).toEqual([{ status: 'SKIPPED', updatedAt: now }]);
  });
});
