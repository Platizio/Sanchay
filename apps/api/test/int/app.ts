import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { buildFastifyAdapter, configureApp } from '../../src/bootstrap.js';
import type { Env } from '../../src/config/env.js';
import { CLOCK, FakeClock } from '../../src/modules/platform/clock.js';
import { createTestDatabase, type TestDatabase } from './db.js';
import { testEnv } from './env.js';

export interface TestApp {
  app: NestFastifyApplication;
  db: TestDatabase;
  clock: FakeClock;
  env: Env;
  close(): Promise<void>;
}

export async function bootTestApp(
  options: { env?: Record<string, string>; clock?: FakeClock } = {},
): Promise<TestApp> {
  const db = await createTestDatabase();
  const env = testEnv(db.url, options.env);
  const clock = options.clock ?? new FakeClock();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
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
    close: async () => {
      await app.close();
      await db.drop();
    },
  };
}
