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
  const { runWorker } = await import('./modules/platform/jobs/worker.main.js');
  await runWorker(env);
} else {
  const { createApp } = await import('./bootstrap.js');
  const app = await createApp(env);
  await app.listen(env.PORT, env.HOST);
}
