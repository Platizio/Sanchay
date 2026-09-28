import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { runMigrations } from '../db/migrate.js';

loadDotEnvFile();
const env = parseEnv(process.env);
await runMigrations(env.DATABASE_URL);
console.log('migrations applied');
