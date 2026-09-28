import 'reflect-metadata';
import { loadDotEnvFile } from './config/dotenv.js';
import { parseEnv } from './config/env.js';

loadDotEnvFile();
const env = parseEnv(process.env);

if (env.SANCHAY_APP_ROLE === 'migrate') {
  const { runMigrations } = await import('./db/migrate.js');
  await runMigrations(env.DATABASE_URL);
  console.log('migrations applied');
  process.exit(0);
}

if (env.SANCHAY_APP_ROLE === 'worker') {
  console.error(
    'SANCHAY_APP_ROLE=worker is not available yet: the JobsModule (pg-boss) lands in plan-02-mvp-kernel',
  );
  process.exit(1);
}

const { createApp } = await import('./bootstrap.js');
const app = await createApp(env);
await app.listen(env.PORT, env.HOST);
