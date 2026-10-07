import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { and, eq, lt } from 'drizzle-orm';
import { AppConfig } from '../../config/app-config.js';
import { createDb, DB, type DbHandle } from '../../db/client.js';
import { CLOCK, type Clock, DAY } from '../platform/clock.js';
import { type Job, JobHandler } from '../platform/jobs/job-registry.js';
import { AccountSessions } from './account-sessions.service.js';
import { AuthService } from './auth.service.js';
import { ContactEmailService } from './contact-email.service.js';
import { DeviceRegistry } from './device-registry.service.js';
import { authSessions, otpCodes } from './identity.schema.js';
import { InvestorAccounts } from './investor-accounts.service.js';
import { LoginRouter } from './login.router.js';
import { MeRouter } from './me.router.js';
import { OTP_BOOKKEEPING_DB, OtpService } from './otp.service.js';
import { SessionGuard } from './session.guard.js';
import { SessionRouter } from './session.router.js';
import { SessionService } from './session.service.js';

/**
 * Deviation (B18): the brief's identity.module.ts did not wire OTP_BOOKKEEPING_DB. otp.service.ts's own
 * doc comment says whoever wires OtpService into a Nest module must provide it as its own small DbHandle
 * (createDb(env.DATABASE_URL, 2..4)), separate from the DB token, and close it on shutdown — mirroring
 * PlatformModule's DbLifecycle pattern for the main DB pool.
 */
@Injectable()
class OtpBookkeepingDbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(OTP_BOOKKEEPING_DB) private readonly dbh: DbHandle) {}

  async onApplicationShutdown(): Promise<void> {
    await this.dbh.close();
  }
}

/**
 * R-13: only LOGIN and VERIFY_EMAIL otp_codes age out here; CONSENT rows (added in Plan-03 E3/E4)
 * are excluded on purpose and are never touched by this handler.
 */
@Injectable()
@JobHandler('identity.cleanup')
class IdentityCleanupJob {
  constructor(
    @Inject(DB) private readonly dbh: DbHandle,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async handle(_job: Job<'identity.cleanup'>): Promise<void> {
    const now = this.clock.now();
    await this.dbh.db
      .delete(otpCodes)
      .where(
        and(lt(otpCodes.expiresAt, new Date(now.getTime() - DAY)), eq(otpCodes.purpose, 'LOGIN')),
      );
    await this.dbh.db
      .delete(otpCodes)
      .where(
        and(
          lt(otpCodes.expiresAt, new Date(now.getTime() - DAY)),
          eq(otpCodes.purpose, 'VERIFY_EMAIL'),
        ),
      );
    await this.dbh.db
      .delete(authSessions)
      .where(lt(authSessions.absoluteExpiresAt, new Date(now.getTime() - 7 * DAY)));
  }
}

@Module({
  controllers: [LoginRouter, SessionRouter, MeRouter],
  providers: [
    OtpService,
    InvestorAccounts,
    DeviceRegistry,
    SessionService,
    AuthService,
    AccountSessions,
    ContactEmailService,
    SessionGuard,
    IdentityCleanupJob,
    {
      provide: OTP_BOOKKEEPING_DB,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createDb(config.env.DATABASE_URL, 4),
    },
    OtpBookkeepingDbLifecycle,
  ],
  exports: [OtpService, InvestorAccounts, DeviceRegistry, SessionService, SessionGuard],
})
export class IdentityModule {}
