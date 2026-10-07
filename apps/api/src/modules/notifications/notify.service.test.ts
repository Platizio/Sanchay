import { describe, expect, it, vi } from 'vitest';
import { Notify } from './notify.service.js';

function buildNotify() {
  const inserted: unknown[] = [];
  const enqueued: unknown[] = [];
  const exec = {
    insert: () => ({
      values: (row: unknown) => {
        inserted.push(row);
        return {
          onConflictDoNothing: () => ({ returning: () => Promise.resolve([{ id: 'n-1' }]) }),
        };
      },
    }),
  };
  const crypto = { encrypt: vi.fn(() => Buffer.from('ct')) };
  const clock = { now: () => new Date('2026-10-19T04:30:00.000Z') };
  const jobs = {
    enqueue: vi.fn((_exec: unknown, name: string, data: unknown) => {
      enqueued.push({ name, data });
      return Promise.resolve();
    }),
  };
  const notify = new Notify(crypto as never, clock as never, jobs as never);
  return { notify, exec, inserted, enqueued, crypto };
}

describe('Notify.enqueue', () => {
  it('encrypts the payload and enqueues notifications.send', async () => {
    const { notify, exec, inserted, enqueued, crypto } = buildNotify();
    await notify.enqueue(exec as never, 'SECURITY_NEW_SIGN_IN', {
      investorId: 'inv-1',
      data: { platform: 'WEB' },
      dedupeKey: 'SECURITY_NEW_SIGN_IN:device-1',
    });
    expect(inserted).toHaveLength(1);
    expect(crypto.encrypt).toHaveBeenCalledWith(
      JSON.stringify({ platform: 'WEB' }),
      expect.objectContaining({ table: 'notifications', column: 'payload_enc' }),
    );
    expect(enqueued).toEqual([
      { name: 'notifications.send', data: { notificationId: expect.any(String) } },
    ]);
  });

  it('is a silent no-op when the dedupeKey already exists (ON CONFLICT DO NOTHING, RV-02-68)', async () => {
    const { notify, enqueued } = buildNotify();
    const exec = {
      insert: () => ({
        values: () => ({ onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }) }),
      }),
    };
    await expect(
      notify.enqueue(exec as never, 'SECURITY_NEW_SIGN_IN', {
        investorId: 'inv-1',
        data: {},
        dedupeKey: 'dup-key',
      }),
    ).resolves.toBeUndefined();
    expect(enqueued).toHaveLength(0);
  });
});
