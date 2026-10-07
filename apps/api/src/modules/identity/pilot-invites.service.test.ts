import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../platform/errors.js';
import { PilotInvites } from './pilot-invites.service.js';

function buildExec(rows: Array<{ id: string }>) {
  const updated: unknown[] = [];
  const exec = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
    update: () => ({
      set: (patch: unknown) => ({
        where: () => {
          updated.push(patch);
          return Promise.resolve();
        },
      }),
    }),
    insert: () => ({ values: () => Promise.resolve() }),
  };
  return { exec, updated };
}

describe('PilotInvites.assertInvited', () => {
  it('throws PILOT_INVITE_REQUIRED when no live, unexpired invite exists for the mobile', async () => {
    const { exec } = buildExec([]);
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const invites = new PilotInvites(
      { now: () => new Date('2026-10-19T04:30:00.000Z') } as never,
      audit as never,
    );
    await expect(invites.assertInvited(exec as never, Buffer.from('bidx'))).rejects.toMatchObject(
      new AppError('PILOT_INVITE_REQUIRED'),
    );
  });

  it('consumes the invite (sets used_at) when one is found', async () => {
    const { exec, updated } = buildExec([{ id: 'invite-1' }]);
    const audit = { record: vi.fn(() => Promise.resolve()) };
    const invites = new PilotInvites(
      { now: () => new Date('2026-10-19T04:30:00.000Z') } as never,
      audit as never,
    );
    await expect(
      invites.assertInvited(exec as never, Buffer.from('bidx')),
    ).resolves.toBeUndefined();
    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ usedAt: new Date('2026-10-19T04:30:00.000Z') });
  });
});
