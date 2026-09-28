import { existsSync, readFileSync } from 'node:fs';
import { parseEnv as parseDotEnvText } from 'node:util';

/** Adds keys from dotenv text that are not already set. Process env always wins (interface sheet §5.2). */
export function mergeDotEnv(target: Record<string, string | undefined>, text: string): string[] {
  const parsed = parseDotEnvText(text) as Record<string, string>;
  const added: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (target[key] === undefined) {
      target[key] = value;
      added.push(key);
    }
  }
  return added;
}

/** Local convenience only: deployed environments get variables from ECS and Secrets Manager and ship no .env file. */
export function loadDotEnvFile(
  path = '.env',
  target: Record<string, string | undefined> = process.env,
): string[] {
  if (!existsSync(path)) return [];
  return mergeDotEnv(target, readFileSync(path, 'utf8'));
}
