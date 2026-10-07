import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock, DAY } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { newId } from '../platform/ids.js';
import { pilotInvites } from './pilot-invites.schema.js';

export interface AddPilotInviteInput {
  mobileBidx: Buffer;
  invitedBy: string;
  note: string | null;
  ttlDays: number;
}

@Injectable()
export class PilotInvites {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /**
   * Runs only for a mobile with no existing investor row, and only when SANCHAY_PILOT_INVITE_ONLY=true
   * (AuthService's caller decides both). It always runs AFTER OTP verification (H-5 anti-enumeration):
   * a wrong code never reveals whether a mobile is invited. Consumes the invite in the same call, in
   * the same DB transaction as the rest of verifyLoginOtp, so a rolled-back sign-in leaves it unused.
   */
  async assertInvited(exec: DbExecutor, mobileBidx: Buffer): Promise<void> {
    const now = this.clock.now();
    const [row] = await exec
      .select({ id: pilotInvites.id })
      .from(pilotInvites)
      .where(
        and(
          eq(pilotInvites.mobileBidx, mobileBidx),
          isNull(pilotInvites.usedAt),
          gt(pilotInvites.expiresAt, now),
        ),
      )
      .limit(1);
    if (row === undefined) throw new AppError('PILOT_INVITE_REQUIRED');
    await exec
      .update(pilotInvites)
      .set({ usedAt: now, updatedAt: now })
      .where(eq(pilotInvites.id, row.id));
  }

  async add(exec: DbExecutor, input: AddPilotInviteInput): Promise<void> {
    const now = this.clock.now();
    const id = newId('pilot_invites');
    await exec.insert(pilotInvites).values({
      id,
      createdAt: now,
      updatedAt: now,
      mobileBidx: input.mobileBidx,
      invitedBy: input.invitedBy,
      note: input.note,
      expiresAt: new Date(now.getTime() + input.ttlDays * DAY),
    });
    await this.audit.record(exec, {
      action: AUDIT_ACTIONS.PILOT_INVITE_ADDED,
      actorType: 'ADMIN',
      actorId: input.invitedBy,
      entityType: 'pilot_invite',
      entityId: id,
      data: {},
    });
  }
}
