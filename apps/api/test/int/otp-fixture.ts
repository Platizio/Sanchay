import type { ClsService } from 'nestjs-cls';
import { AppConfig } from '../../src/config/app-config.js';
import type { DbHandle } from '../../src/db/client.js';
import { CaptureEmailSender } from '../../src/integrations/email/fake.js';
import { CaptureSmsSender } from '../../src/integrations/sms/fake.js';
import { OtpService } from '../../src/modules/identity/otp.service.js';
import { AuditService } from '../../src/modules/platform/audit.service.js';
import { FakeClock } from '../../src/modules/platform/clock.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import type { SanchayClsStore } from '../../src/modules/platform/request-context.js';
import type { TestDatabase } from './db.js';
import { testEnv, testKeyService } from './env.js';

export const noRequestContext = { isActive: () => false } as unknown as ClsService<SanchayClsStore>;

/**
 * OtpService wired by hand against a test database, with capture senders and a FakeClock (10:00 IST,
 * 12 Oct 2026). `dbOverrides.main`/`dbOverrides.bookkeeping` default to `t`, so every existing caller keeps
 * using a single pool; a test proving the round-1 pool-deadlock fix (otp-verify) points them at two
 * genuinely separate `DbHandle`s instead.
 */
export function otpFixture(
  t: TestDatabase,
  envOverrides: Record<string, string> = {},
  dbOverrides: { main?: DbHandle; bookkeeping?: DbHandle } = {},
) {
  const env = testEnv(t.url, envOverrides);
  const keys = testKeyService(env);
  const crypto = new Crypto(keys);
  const clock = new FakeClock();
  const sms = new CaptureSmsSender();
  const email = new CaptureEmailSender();
  const mainDb = dbOverrides.main ?? t;
  const bookkeepingDb = dbOverrides.bookkeeping ?? t;
  const audit = new AuditService(bookkeepingDb, noRequestContext, clock);
  const otp = new OtpService(
    mainDb,
    bookkeepingDb,
    crypto,
    keys,
    clock,
    sms,
    email,
    new AppConfig(env),
    audit,
  );
  return { otp, crypto, keys, clock, sms, email, env };
}
