import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// D-21: use the resolution wrapper when Task B6's spike kept it; otherwise the plain drizzle-kit CLI.
const KIT = existsSync('scripts/drizzle-kit.cjs')
  ? 'node scripts/drizzle-kit.cjs'
  : 'pnpm exec drizzle-kit';

const journal = (): string => readFileSync('drizzle/meta/_journal.json', 'utf8');
const files = (): string => readdirSync('drizzle').sort().join('|');

const before = {
  journal: journal(),
  files: files(),
  metaFiles: readdirSync('drizzle/meta'),
};

execSync(`${KIT} check`, { stdio: 'inherit' });
execSync(`${KIT} generate --name=drift_check`, { stdio: 'inherit' });

if (journal() !== before.journal || files() !== before.files) {
  for (const f of readdirSync('drizzle')) {
    if (f.includes('drift_check')) rmSync(`drizzle/${f}`);
  }
  for (const f of readdirSync('drizzle/meta')) {
    if (!before.metaFiles.includes(f)) rmSync(`drizzle/meta/${f}`);
  }
  writeFileSync('drizzle/meta/_journal.json', before.journal);
  console.error(
    'db:check FAILED: the schema differs from the committed migrations. Run db:generate --name=<change> and commit it.',
  );
  process.exit(1);
}
console.log('db:check OK: schema and migrations are in sync');
