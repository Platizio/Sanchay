/**
 * pnpm ops:legal:seed
 * Upserts every docs/legal/documents/*.md file into app.legal_documents (key + version is the identity).
 * Front matter: `key: TNC`, `version: '1'`, `status: DRAFT|PUBLISHED`, optional `effective_from`.
 * Counsel sign-off (G-C1) flips `status` to PUBLISHED in a docs-only commit; this CLI never publishes on its own.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb } from '../db/client.js';
import { legalDocuments } from '../modules/legal-consent/legal-consent.schema.js';
import { newId } from '../modules/platform/ids.js';

function parseFrontMatter(body: string): { meta: Record<string, string>; markdown: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(body);
  if (match === null) throw new Error('ops:legal:seed: missing front matter');
  const front = match[1] ?? '';
  const markdown = match[2] ?? '';
  const meta: Record<string, string> = {};
  for (const line of front.split('\n')) {
    const [k, ...rest] = line.split(':');
    if (k === undefined || rest.length === 0) continue;
    meta[k.trim()] = rest
      .join(':')
      .trim()
      .replace(/^'(.*)'$/, '$1');
  }
  return { meta, markdown: markdown.trim() };
}

async function main(): Promise<void> {
  loadDotEnvFile(); // apps/api/.env, as Plan 01's migrate.ts
  const env = parseEnv(process.env);
  const db = createDb(env.DATABASE_URL, 2);
  try {
    // apps/api/{src,dist}/cli -> apps/api/{src,dist} -> apps/api -> apps -> repo root
    const dir = path.resolve(
      fileURLToPath(new URL('../../../../docs/legal/documents', import.meta.url)),
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
    let upserted = 0;
    for (const file of files) {
      const raw = await readFile(path.join(dir, file), 'utf8');
      const { meta, markdown } = parseFrontMatter(raw);
      const { key, version } = meta;
      if (key === undefined || version === undefined) {
        throw new Error(`ops:legal:seed: ${file} needs key and version in its front matter`);
      }
      const effectiveFrom =
        meta.effective_from === undefined ? null : new Date(meta.effective_from);
      const status = (meta.status ?? 'DRAFT') as (typeof legalDocuments.$inferInsert)['status'];
      const sha256 = createHash('sha256').update(markdown, 'utf8').digest();
      await db.db
        .insert(legalDocuments)
        .values({
          id: newId('legal_documents'),
          createdBy: 'ops:legal:seed',
          updatedBy: 'ops:legal:seed',
          key: key as (typeof legalDocuments.$inferInsert)['key'],
          version,
          bodyMarkdown: markdown,
          sha256,
          status,
          effectiveFrom,
        })
        .onConflictDoUpdate({
          target: [legalDocuments.key, legalDocuments.version],
          set: { bodyMarkdown: markdown, sha256, status, effectiveFrom },
        });
      upserted += 1;
    }
    console.log(`ops:legal:seed: upserted ${upserted} legal_documents rows`);
  } finally {
    await db.close();
  }
}

await main();
