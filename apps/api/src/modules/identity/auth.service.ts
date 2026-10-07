import { Inject, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { DB, type DbHandle, type Tx } from '../../db/client.js';
import { Notify } from '../notifications/notify.service.js';
import { AUDIT_ACTIONS, AuditService } from '../platform/audit.service.js';
import { CLOCK, type Clock } from '../platform/clock.js';
import { AppError } from '../platform/errors.js';
import { pgErrorCodeOf } from '../platform/pg-errors.js';
import type { SanchayClsStore } from '../platform/request-context.js';
import { DeviceRegistry } from './device-registry.service.js';
import { InvestorAccounts } from './investor-accounts.service.js';
import { OtpService, type VerifiedOtp } from './otp.service.js';
import { type OtpSentBody, toOtpSent } from './otp-sent.js';
import { requireDeviceContext } from './request-auth.js';
import { type IssuedSession, SessionService } from './session.service.js';

export interface SignedIn {
  status: 'SIGNED_IN';
  investorId: string;
  isNewInvestor: boolean;
  isNewDevice: boolean;
  session: IssuedSession;
}

const BLOCKED_STATUSES: ReadonlySet<string> = new Set(['CLOSED', 'SUSPENDED', 'FRAUD_HOLD']);

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(InvestorAccounts) private readonly accounts: InvestorAccounts,
    @Inject(DeviceRegistry) private readonly devices: DeviceRegistry,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ClsService) private readonly cls: ClsService<SanchayClsStore>,
    @Inject(Notify) private readonly notify: Notify,
  ) {}

  /** Same response shape for every mobile (no account enumeration, H-5). */
  async requestLoginOtp(mobile: string): Promise<OtpSentBody> {
    const ctx = requireDeviceContext(this.cls);
    const issued = await this.otp.issue({
      purpose: 'LOGIN',
      destination: { channel: 'SMS', value: mobile },
      referenceId: null,
      ip: ctx.ip,
      deviceRefHash: ctx.deviceRefHash,
    });
    await this.audit.record(null, {
      action: AUDIT_ACTIONS.AUTH_OTP_SENT,
      actorType: 'ANONYMOUS',
      data: {
        channel: 'SMS',
        purpose: 'LOGIN',
        platform: ctx.platform,
        challengeId: issued.challengeId,
      },
    });
    return toOtpSent(issued, this.clock.now());
  }

  /** MVP: a valid SMS code always signs in; a new installation is only flagged (isNewDevice). Step-up is P2-3. */
  async verifyLoginOtp(challengeId: string, code: string): Promise<SignedIn> {
    const ctx = requireDeviceContext(this.cls);
    let verifyFailure: AppError | null = null;
    try {
      return await this.inTx(async (tx) => {
        let verified: VerifiedOtp;
        try {
          verified = await this.otp.verify(tx, { challengeId, purpose: 'LOGIN', code });
        } catch (error) {
          if (error instanceof AppError) verifyFailure = error;
          throw error;
        }
        if (verified.channel !== 'SMS') throw new AppError('OTP_INVALID');
        const mobile = verified.destination;
        const existing = await this.accounts.findByMobile(tx, mobile);
        // The S2 pilot invite gate (403 PILOT_INVITE_REQUIRED) hooks in here, before a new investor is created.
        const investor = existing ?? (await this.accounts.createWithVerifiedMobile(tx, mobile));
        if (BLOCKED_STATUSES.has(investor.status)) throw new AppError('FORBIDDEN');
        const { device, isNew: isNewDevice } = await this.devices.upsert(tx, investor.id, {
          platform: ctx.platform,
          refHash: ctx.deviceRefHash,
          appVersion: ctx.appVersion,
        });
        const session = await this.sessions.create(tx, {
          investorId: investor.id,
          deviceId: device.id,
          platform: ctx.platform,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        });
        const isNewInvestor = existing === null;
        if (isNewDevice) {
          await this.notify.enqueue(tx, 'SECURITY_NEW_SIGN_IN', {
            investorId: investor.id,
            data: { platform: ctx.platform },
            dedupeKey: `SECURITY_NEW_SIGN_IN:${device.id}`,
          });
        }
        await this.audit.record(tx, {
          action: isNewInvestor ? AUDIT_ACTIONS.AUTH_SIGNUP : AUDIT_ACTIONS.AUTH_LOGIN,
          actorType: 'INVESTOR',
          actorId: investor.id,
          entityType: 'investor',
          entityId: investor.id,
          data: {
            platform: ctx.platform,
            sessionId: session.sessionId,
            deviceId: device.id,
            isNewInvestor,
            isNewDevice,
            challengeId,
          },
        });
        return {
          status: 'SIGNED_IN',
          investorId: investor.id,
          isNewInvestor,
          isNewDevice,
          session,
        };
      });
    } catch (error) {
      if (verifyFailure !== null) await this.auditVerifyFailure(verifyFailure, challengeId);
      throw error;
    }
  }

  /**
   * Failed attempts are audited only after the transaction has rolled back and released its main-pool
   * connection, as an own autocommit write that survives the rollback. Writing it from inside the open
   * transaction would hold one main-pool connection while waiting for a second: SANCHAY_DB_POOL_MAX
   * concurrent wrong codes would then exhaust the pool (the B14 pattern), turning 401s into 500s and
   * stalling every other request. OTP_LOCKED (this code is burned; also every later attempt on it) →
   * AUTH_OTP_LOCKED; anything else → AUTH_OTP_FAILED.
   */
  private async auditVerifyFailure(error: AppError, challengeId: string): Promise<void> {
    await this.audit.record(null, {
      action:
        error.code === 'OTP_LOCKED' ? AUDIT_ACTIONS.AUTH_OTP_LOCKED : AUDIT_ACTIONS.AUTH_OTP_FAILED,
      actorType: 'ANONYMOUS',
      data: { purpose: 'LOGIN', channel: 'SMS', outcome: error.code, challengeId },
    });
  }

  private async inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.dbh.db.transaction(fn, { isolationLevel: 'read committed' });
    } catch (error) {
      // Concurrent first sign-up of one mobile: the OTP consume rolled back, so the client may retry.
      if (pgErrorCodeOf(error) === '23505')
        throw new AppError('CONFLICT_VERSION', { retryable: true, cause: error });
      throw error;
    }
  }
}
