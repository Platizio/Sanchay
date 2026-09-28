import type { DynamicModule, Type } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { buildFastifyAdapter, configureApp } from '../../src/bootstrap.js';
import type { Env } from '../../src/config/env.js';
import type { CaptureEmailSender } from '../../src/integrations/email/fake.js';
import { EMAIL_SENDER } from '../../src/integrations/email/port.js';
import type { CaptureSmsSender } from '../../src/integrations/sms/fake.js';
import { SMS_SENDER } from '../../src/integrations/sms/port.js';
import { CLOCK, FakeClock } from '../../src/modules/platform/clock.js';
import { createTestDatabase, type TestDatabase } from './db.js';
import { testEnv } from './env.js';

export interface TestApp {
  app: NestFastifyApplication;
  db: TestDatabase;
  clock: FakeClock;
  env: Env;
  /** Capture senders (testEnv sets SANCHAY_PROVIDER_MODE_*=capture). Read OTPs with sms.latestCode(mobile). */
  sms: CaptureSmsSender;
  email: CaptureEmailSender;
  close(): Promise<void>;
}

export async function bootTestApp(
  options: {
    env?: Record<string, string>;
    clock?: FakeClock;
    /** Extra test-only modules (for example InfraRoutesTestModule); AppModule's global guards apply to them. */
    testModules?: Array<Type<unknown> | DynamicModule>;
  } = {},
): Promise<TestApp> {
  const db = await createTestDatabase();
  const env = testEnv(db.url, options.env);
  const clock = options.clock ?? new FakeClock();
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(env), ...(options.testModules ?? [])],
  })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(buildFastifyAdapter(), {
    bodyParser: false,
  });
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return {
    app,
    db,
    clock,
    env,
    sms: app.get<CaptureSmsSender>(SMS_SENDER),
    email: app.get<CaptureEmailSender>(EMAIL_SENDER),
    close: async () => {
      await app.close();
      await db.drop();
    },
  };
}
