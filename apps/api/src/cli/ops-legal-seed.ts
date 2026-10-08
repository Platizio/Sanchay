/**
 * pnpm ops:legal:seed
 * Upserts every docs/legal/documents/*.md file into app.legal_documents (key + version is the identity).
 * A DRAFT row follows its file. A PUBLISHED or RETIRED row never changes its text, hash or date (published text is
 * the evidence acceptances point at): re-seeding an identical file is a no-op, PUBLISHED to RETIRED is the one
 * allowed move, and anything else exits non-zero (bump the version instead). A PUBLISHED version after the first
 * must carry effective_from (LC-2, LC-3).
 * Front matter: `key: TNC`, `version: '1'`, `status: DRAFT|PUBLISHED`, optional `effective_from`.
 * Counsel sign-off (G-C1) flips `status` to PUBLISHED in a docs-only commit; this CLI never publishes on its own.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, ne } from 'drizzle-orm';
import { loadDotEnvFile } from '../config/dotenv.js';
import { parseEnv } from '../config/env.js';
import { createDb, type Database } from '../db/client.js';
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

type LegalDocumentRow = typeof legalDocuments.$inferSelect;

/** Upserts every .md file in `dir`; returns how many files were seeded. Throws on the first refused change. */
export async function seedLegalDocuments(db: Database, dir: string): Promise<number> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.md')).sort();
  let seeded = 0;
  for (const file of files) {
    const raw = await readFile(path.join(dir, file), 'utf8');
    const { meta, markdown } = parseFrontMatter(raw);
    const { key, version } = meta;
    if (key === undefined || version === undefined) {
      throw new Error(`ops:legal:seed: ${file} needs key and version in its front matter`);
    }
    const docKey = key as LegalDocumentRow['key'];
    const effectiveFrom = meta.effective_from === undefined ? null : new Date(meta.effective_from);
    const status = (meta.status ?? 'DRAFT') as LegalDocumentRow['status'];
    const sha256 = createHash('sha256').update(markdown, 'utf8').digest();
    if (status === 'PUBLISHED' && effectiveFrom === null) {
      const others = await db
        .select({ version: legalDocuments.version })
        .from(legalDocuments)
        .where(
          and(
            eq(legalDocuments.key, docKey),
            eq(legalDocuments.status, 'PUBLISHED'),
            ne(legalDocuments.version, version),
          ),
        );
      if (others.length > 0) {
        throw new Error(
          `ops:legal:seed: ${file}: ${key} already has PUBLISHED version ${others.map((o) => o.version).join(', ')}; a later PUBLISHED version needs effective_from`,
        );
      }
    }
    // Only a DRAFT row follows its file; a PUBLISHED or RETIRED one is left exactly as it is.
    await db
      .insert(legalDocuments)
      .values({
        id: newId('legal_documents'),
        createdBy: 'ops:legal:seed',
        updatedBy: 'ops:legal:seed',
        key: docKey,
        version,
        bodyMarkdown: markdown,
        sha256,
        status,
        effectiveFrom,
      })
      .onConflictDoUpdate({
        target: [legalDocuments.key, legalDocuments.version],
        set: { bodyMarkdown: markdown, sha256, status, effectiveFrom },
        setWhere: eq(legalDocuments.status, 'DRAFT'),
      });
    const [row] = await db
      .select()
      .from(legalDocuments)
      .where(and(eq(legalDocuments.key, docKey), eq(legalDocuments.version, version)));
    if (row === undefined) throw new Error(`ops:legal:seed: ${file}: row missing after upsert`);
    const sameText =
      row.sha256.equals(sha256) && row.effectiveFrom?.getTime() === effectiveFrom?.getTime();
    if (row.status === status && sameText) {
      seeded += 1;
    } else if (row.status === 'PUBLISHED' && status === 'RETIRED' && sameText) {
      await db
        .update(legalDocuments)
        .set({ status: 'RETIRED', updatedBy: 'ops:legal:seed' })
        .where(eq(legalDocuments.id, row.id));
      seeded += 1;
    } else {
      throw new Error(
        `ops:legal:seed: ${file}: ${key} version ${version} is ${row.status} and its file differs; published legal text is immutable, bump the version instead`,
      );
    }
  }
  return seeded;
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
    const seeded = await seedLegalDocuments(db.db, dir);
    console.log(`ops:legal:seed: seeded ${seeded} legal_documents rows`);
  } finally {
    await db.close();
  }
}

// Run only as the CLI entry point, so a test can import seedLegalDocuments without side effects.
if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
