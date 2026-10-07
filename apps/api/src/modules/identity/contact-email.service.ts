import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { DB, type DbHandle } from '../../db/client.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { UUID_RE } from '../platform/ids.js';
import type { AuthContext, SanchayClsStore } from '../platform/request-context.js';
import { otpCodes } from './identity.schema.js';
import { InvestorAccounts } from './investor-accounts.service.js';
import { OtpService } from './otp.service.js';
import { type OtpSentBody, toOtpSent } from './otp-sent.js';

/** Adds the first verified email. Replacing a verified email is a contact change (DEF P2-3, H-9). */
@Injectable()
export class ContactEmailService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(InvestorAccounts) private readonly accounts: InvestorAccounts,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
  ) {}

  async requestVerification(auth: AuthContext, email: string): Promise<OtpSentBody> {
    const normalized = email.trim().toLowerCase();
    await this.accounts.assertEmailAvailable(this.dbh.db, auth.investorId, normalized);
    const issued = await this.otp.issue({
      purpose: 'VERIFY_EMAIL',
      destination: { channel: 'EMAIL', value: normalized },
      referenceId: auth.investorId,
      ip: this.cls.get('ip') ?? null,
    });
    await this.audit.record(null, {
      action: AUDIT_ACTIONS.CONTACT_EMAIL_OTP_SENT,
      actorType: 'INVESTOR',
      actorId: auth.investorId,
      entityType: 'investor',
      entityId: auth.investorId,
      data: { channel: 'EMAIL', purpose: 'VERIFY_EMAIL', challengeId: issued.challengeId },
    });
    return toOtpSent(issued, this.clock.now());
  }

  async verify(
    auth: AuthContext,
    challengeId: string,
    code: string,
  ): Promise<{ emailMasked: string; emailVerifiedAt: string }> {
    // EF8-5: OtpService.verify commits its attempt bump on its own pool before it compares the code, so a
    // challenge that is not this investor's is refused here, untouched. Another investor's wrong codes
    // would otherwise lock the owner's code, and three locked codes in 60 min lock the owner's email.
    if (!(await this.isOwnChallenge(auth.investorId, challengeId)))
      throw new AppError('OTP_INVALID');
    const result = await this.dbh.db.transaction(
      async (tx) => {
        const verified = await this.otp.verify(tx, { challengeId, purpose: 'VERIFY_EMAIL', code });
        const [row] = await tx
          .select({ referenceId: otpCodes.referenceId })
          .from(otpCodes)
          .where(eq(otpCodes.id, verified.otpId))
          .limit(1);
        // BOLA: a challenge issued to another investor behaves exactly like a wrong code; the consume rolls back.
        if (verified.channel !== 'EMAIL' || row?.referenceId !== auth.investorId)
          throw new AppError('OTP_INVALID');
        const done = await this.accounts.setVerifiedEmail(
          tx,
          auth.investorId,
          verified.destination,
        );
        await this.audit.record(tx, {
          action: AUDIT_ACTIONS.CONTACT_EMAIL_VERIFIED,
          actorType: 'INVESTOR',
          actorId: auth.investorId,
          entityType: 'investor',
          entityId: auth.investorId,
          data: { channel: 'EMAIL', purpose: 'VERIFY_EMAIL', challengeId },
        });
        return done;
      },
      { isolationLevel: 'read committed' },
    );
    return {
      emailMasked: result.emailMasked,
      emailVerifiedAt: result.emailVerifiedAt.toISOString(),
    };
  }

  private async isOwnChallenge(investorId: string, challengeId: string): Promise<boolean> {
    if (!UUID_RE.test(challengeId)) return false;
    const [row] = await this.dbh.db
      .select({ referenceId: otpCodes.referenceId })
      .from(otpCodes)
      .where(and(eq(otpCodes.id, challengeId), eq(otpCodes.purpose, 'VERIFY_EMAIL')))
      .limit(1);
    return row?.referenceId === investorId;
  }
}
