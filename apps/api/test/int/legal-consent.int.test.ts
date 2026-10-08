import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConsentSnapshotV2Schema, snapshotSha256 } from '@sanchay/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedLegalDocuments } from '../../src/cli/ops-legal-seed.js';
import {
  consentChallenges,
  consentRecords,
  consentSubjects,
  legalDocuments,
} from '../../src/modules/legal-consent/legal-consent.schema.js';
import { LegalDocs } from '../../src/modules/legal-consent/legal-docs.service.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { asRowId, newId } from '../../src/modules/platform/ids.js';
import { bootTestApp, type TestApp } from './app.js';

let ta: TestApp;

beforeAll(async () => {
  ta = await bootTestApp();
});

afterAll(async () => {
  await ta.close();
});

const INVESTOR_ID = '018f2f3a-0000-7000-8000-000000000001';
const SUBJECT_ID = '018f2f3a-0000-7000-8000-000000000002';

/** Runs one statement as sanchay_app inside a rolled-back transaction; returns the error or undefined. */
async function asAppRole(sqlText: string, params: unknown[] = []): Promise<Error | undefined> {
  const client = await ta.db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE sanchay_app');
    await client.query(sqlText, params);
    return undefined;
  } catch (e) {
    return e as Error;
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

function seedDoc(key: 'TNC' | 'KYC_CONSENT', version: string, markdown: string) {
  return {
    id: newId('legal_documents'),
    createdBy: 'test',
    updatedBy: 'test',
    key,
    version,
    bodyMarkdown: markdown,
    sha256: createHash('sha256').update(markdown, 'utf8').digest(),
  };
}

describe('legal_consent schema and LegalDocs', () => {
  it('hash(insert) === hash(reload): snapshot_enc round-trips on PG 18 for any well-formed snapshot', async () => {
    const crypto = ta.app.get(Crypto);
    const snapshot = ConsentSnapshotV2Schema.parse({
      version: 'sanchay.consent.v2',
      subjectType: 'PURCHASE',
      investorId: INVESTOR_ID,
      subjects: [{ table: 'orders', subjectId: SUBJECT_ID }],
      legalDocuments: [{ key: 'TPL_PURCHASE', version: '1', sha256: 'a'.repeat(64) }],
      moneyParamsVersion: '2026-09-01',
      destinationsMasked: ['9XXXXX2345'],
      fields: { amount: '25000.00' },
    });
    const id = newId('consent_challenges');
    const ref = { table: 'consent_challenges', column: 'snapshot_enc', rowId: id } as const;
    const shaBefore = await snapshotSha256(snapshot);
    await ta.db.db.insert(consentChallenges).values({
      id,
      createdBy: INVESTOR_ID,
      updatedBy: INVESTOR_ID,
      investorId: INVESTOR_ID,
      subjectType: 'PURCHASE',
      templateKey: 'TPL_PURCHASE',
      snapshotEnc: crypto.encrypt(JSON.stringify(snapshot), ref),
      snapshotSha256: Buffer.from(shaBefore, 'hex'),
      requiredFactors: ['SMS'],
      moneyParamsVersion: '2026-09-01',
      expiresAt: new Date(ta.clock.now().getTime() + 600_000),
    });
    await ta.db.db.insert(consentSubjects).values({
      challengeId: id,
      subjectTable: 'orders',
      subjectId: SUBJECT_ID,
    });
    const [row] = await ta.db.db
      .select()
      .from(consentChallenges)
      .where(eq(consentChallenges.id, id));
    if (row === undefined) throw new Error('consent_challenges row did not reload');
    const reloaded = JSON.parse(crypto.decrypt(row.snapshotEnc, ref));
    const shaAfter = await snapshotSha256(ConsentSnapshotV2Schema.parse(reloaded));
    expect(shaAfter).toBe(shaBefore);
    expect(row.snapshotSha256.toString('hex')).toBe(shaBefore);
    expect(row.status).toBe('PENDING');
    expect(asRowId('consent_challenges', id)).toBe(id);
  });

  it('legal seed sha256 matches the body bytes', async () => {
    const dir = path.resolve(
      fileURLToPath(new URL('../../../../docs/legal/documents', import.meta.url)),
    );
    const raw = await readFile(path.join(dir, 'tnc.md'), 'utf8');
    const markdown = raw.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
    const expected = createHash('sha256').update(markdown, 'utf8').digest();
    await ta.db.db.insert(legalDocuments).values({
      ...seedDoc('TNC', '1', markdown),
      status: 'PUBLISHED',
      effectiveFrom: ta.clock.now(),
    });
    const legalDocs = ta.app.get(LegalDocs);
    const current = await legalDocs.current(ta.db.db, 'TNC');
    expect(current.sha256).toBe(expected.toString('hex'));
    expect(current.version).toBe('1');
    expect(current.bodyMarkdown).toBe(markdown);
  });

  it('current() skips a DRAFT or future-dated version and keeps the PUBLISHED one in force (RV-03-29)', async () => {
    const legalDocs = ta.app.get(LegalDocs);
    await ta.db.db.insert(legalDocuments).values({ ...seedDoc('TNC', '2', 'draft v2') });
    await ta.db.db.insert(legalDocuments).values({
      ...seedDoc('TNC', '3', 'published but future v3'),
      status: 'PUBLISHED',
      effectiveFrom: new Date(ta.clock.now().getTime() + 86_400_000),
    });
    expect((await legalDocs.current(ta.db.db, 'TNC')).version).toBe('1');
  });

  it('current() throws INTERNAL when no PUBLISHED version exists for a key', async () => {
    const legalDocs = ta.app.get(LegalDocs);
    await expect(legalDocs.current(ta.db.db, 'GRIEVANCE_POLICY')).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });
});

describe('consent_records', () => {
  it('UPDATE and DELETE are denied to sanchay_app (append-only), INSERT is allowed', async () => {
    const legalDocs = ta.app.get(LegalDocs);
    await ta.db.db.insert(legalDocuments).values({
      ...seedDoc('KYC_CONSENT', '1', 'placeholder'),
      status: 'PUBLISHED',
      effectiveFrom: ta.clock.now(),
    });
    await legalDocs.recordAcceptance(ta.db.db, {
      investorId: INVESTOR_ID,
      key: 'KYC_CONSENT',
      channel: 'CHECKBOX',
      ip: null,
      userAgent: null,
      sessionId: null,
    });
    const [row] = await ta.db.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.documentKey, 'KYC_CONSENT'))
      .limit(1);
    if (row === undefined) throw new Error('recordAcceptance wrote no consent_records row');
    expect(row.kind).toBe('DOCUMENT_ACCEPTANCE');
    expect(row.challengeId).toBeNull();
    expect(row.subjectType).toBeNull();

    const updateError = await asAppRole(
      'UPDATE app.consent_records SET channel = $1 WHERE id = $2',
      ['X', row.id],
    );
    expect(updateError?.message).toMatch(/permission denied/i);
    const deleteError = await asAppRole('DELETE FROM app.consent_records WHERE id = $1', [row.id]);
    expect(deleteError?.message).toMatch(/permission denied/i);
    const insertError = await asAppRole(
      `INSERT INTO app.consent_records (id, created_by, kind, investor_id, document_key, consumed_at)
       VALUES (gen_random_uuid(), 'test', 'DOCUMENT_ACCEPTANCE', $1, 'TNC', now())`,
      [INVESTOR_ID],
    );
    expect(insertError).toBeUndefined();
  });

  it('sanchay_app may stamp first_attempt_at (column grant) but still no other column (MF-1)', async () => {
    const [row] = await ta.db.db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.documentKey, 'KYC_CONSENT'))
      .limit(1);
    if (row === undefined) throw new Error('the previous case seeds a consent_records row');
    const stamp = await asAppRole(
      'UPDATE app.consent_records SET first_attempt_at = now() WHERE id = $1',
      [row.id],
    );
    expect(stamp).toBeUndefined();
    const other = await asAppRole('UPDATE app.consent_records SET channel = $1 WHERE id = $2', [
      'X',
      row.id,
    ]);
    expect(other?.message).toMatch(/permission denied/i);
  });

  it('refuses a row that sets both or neither of (challenge_id, document_key)', async () => {
    const both = await asAppRole(
      `INSERT INTO app.consent_records (id, created_by, kind, investor_id, challenge_id, document_key, consumed_at)
       VALUES (gen_random_uuid(), 'test', 'DOCUMENT_ACCEPTANCE', $1, gen_random_uuid(), 'TNC', now())`,
      [INVESTOR_ID],
    );
    expect(both?.message).toMatch(/consent_records_kind_pair_ck/);
    const neither = await asAppRole(
      `INSERT INTO app.consent_records (id, created_by, kind, investor_id, consumed_at)
       VALUES (gen_random_uuid(), 'test', 'DOCUMENT_ACCEPTANCE', $1, now())`,
      [INVESTOR_ID],
    );
    expect(neither?.message).toMatch(/consent_records_kind_pair_ck/);
  });
});

describe('LegalDocs.current tiebreak and the published-undated index (LC-3)', () => {
  it('refuses a second PUBLISHED undated version of one key', async () => {
    const insert = (version: string) =>
      ta.db.db.insert(legalDocuments).values({
        ...seedDoc('TNC', version, `undated ${version}`),
        key: 'RISK_DISCLOSURE',
        status: 'PUBLISHED',
      });
    await insert('1');
    await expect(insert('2')).rejects.toMatchObject({
      cause: { constraint: 'legal_documents_published_undated_uq' },
    });
  });

  it('breaks an effective_from tie with the newest row, deterministically', async () => {
    const at = new Date(ta.clock.now().getTime() - 3_600_000);
    const row = (version: string) => ({
      ...seedDoc('TNC', version, `tie ${version}`),
      key: 'REGULAR_PLAN_COMMISSION' as const,
      status: 'PUBLISHED' as const,
      effectiveFrom: at,
    });
    await ta.db.db.insert(legalDocuments).values(row('1'));
    await ta.db.db.insert(legalDocuments).values(row('2'));
    const legalDocs = ta.app.get(LegalDocs);
    expect((await legalDocs.current(ta.db.db, 'REGULAR_PLAN_COMMISSION')).version).toBe('2');
  });
});

describe('ops:legal:seed never rewrites a published document (LC-2)', () => {
  const file = (version: string, status: string, body: string, extra = '') =>
    `---\nkey: PRIVACY_NOTICE\nversion: '${version}'\nstatus: ${status}${extra}\n---\n${body}\n`;
  let dir: string;
  const rowOf = async (version: string) => {
    const rows = await ta.db.db
      .select()
      .from(legalDocuments)
      .where(eq(legalDocuments.key, 'PRIVACY_NOTICE'));
    return rows.find((r) => r.version === version);
  };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'legal-seed-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('inserts a new version and lets a DRAFT be edited and published', async () => {
    await writeFile(path.join(dir, 'privacy.md'), file('1', 'DRAFT', 'first draft'));
    await seedLegalDocuments(ta.db.db, dir);
    expect((await rowOf('1'))?.status).toBe('DRAFT');
    await writeFile(path.join(dir, 'privacy.md'), file('1', 'PUBLISHED', 'final text'));
    await seedLegalDocuments(ta.db.db, dir);
    expect(await rowOf('1')).toMatchObject({ status: 'PUBLISHED', bodyMarkdown: 'final text' });
  });

  it('re-seeding the identical file is a no-op', async () => {
    const before = await rowOf('1');
    await seedLegalDocuments(ta.db.db, dir);
    const after = await rowOf('1');
    expect(after?.updatedAt).toEqual(before?.updatedAt);
    expect(after?.sha256.equals(before?.sha256 ?? Buffer.alloc(0))).toBe(true);
  });

  it('throws and leaves the row unchanged when a PUBLISHED body is edited, or it flips back to DRAFT', async () => {
    const before = await rowOf('1');
    await writeFile(path.join(dir, 'privacy.md'), file('1', 'PUBLISHED', 'typo fixed'));
    await expect(seedLegalDocuments(ta.db.db, dir)).rejects.toThrow(/bump the version/);
    await writeFile(path.join(dir, 'privacy.md'), file('1', 'DRAFT', 'final text'));
    await expect(seedLegalDocuments(ta.db.db, dir)).rejects.toThrow(/bump the version/);
    const after = await rowOf('1');
    expect(after).toMatchObject({ status: 'PUBLISHED', bodyMarkdown: 'final text' });
    expect(after?.sha256.equals(before?.sha256 ?? Buffer.alloc(0))).toBe(true);
  });

  it('the database trigger refuses body, sha256, effective_from and back-to-DRAFT edits of a non-DRAFT row', async () => {
    for (const change of [
      "body_markdown = 'x'",
      "sha256 = decode('00', 'hex')",
      'effective_from = now()',
      "status = 'DRAFT'",
    ]) {
      await expect(
        ta.db.pool.query(
          `UPDATE app.legal_documents SET ${change} WHERE key = 'PRIVACY_NOTICE' AND version = '1'`,
        ),
      ).rejects.toThrow(/immutable/);
    }
  });

  it('requires effective_from on a second PUBLISHED version, and allows PUBLISHED to RETIRED', async () => {
    await writeFile(path.join(dir, 'privacy.md'), file('2', 'PUBLISHED', 'v2 text'));
    await expect(seedLegalDocuments(ta.db.db, dir)).rejects.toThrow(/effective_from/);
    await writeFile(
      path.join(dir, 'privacy.md'),
      file('2', 'PUBLISHED', 'v2 text', "\neffective_from: '2027-01-01T00:00:00Z'"),
    );
    await seedLegalDocuments(ta.db.db, dir);
    expect((await rowOf('2'))?.status).toBe('PUBLISHED');
    await writeFile(path.join(dir, 'privacy.md'), file('1', 'RETIRED', 'final text'));
    await seedLegalDocuments(ta.db.db, dir);
    expect((await rowOf('1'))?.status).toBe('RETIRED');
  });
});
