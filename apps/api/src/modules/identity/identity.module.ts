import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.js';
import { createDb, type DbHandle } from '../../db/client.js';
import { AccountSessions } from './account-sessions.service.js';
import { AuthService } from './auth.service.js';
import { ContactEmailService } from './contact-email.service.js';
import { DeviceRegistry } from './device-registry.service.js';
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
