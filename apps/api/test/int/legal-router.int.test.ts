import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { amcs, commissionDisclosures, schemes, sebiCategories } from '../../src/db/schema.js';
import {
  consentRecords,
  legalDocuments,
} from '../../src/modules/legal-consent/legal-consent.schema.js';
import { bootTestApp, type TestApp } from './app.js';
import { signedInInvestor } from './signed-in.js';

let app: TestApp;

const REQUIRED = [
  'TNC',
  'PRIVACY_NOTICE',
  'RISK_DISCLOSURE',
  'REGULAR_PLAN_COMMISSION',
  'EXECUTION_ONLY_DECLARATION',
  'FATCA_CRS_DECLARATION',
] as const;

// Dated by the FakeClock (LegalDocs.current reads it), one second later per call.
async function seedDocs() {
  app.clock.advance(1_000);
  for (const key of [...REQUIRED, 'NOMINATION_OPT_OUT_ANNEX_B', 'KYC_CONSENT'] as const) {
    await app.db.db
      .insert(legalDocuments)
      .values({
        createdBy: 'test',
        updatedBy: 'test',
        key,
        version: '1',
        bodyMarkdown: `# ${key}`,
        sha256: Buffer.alloc(32),
        status: 'PUBLISHED',
        effectiveFrom: app.clock.now(),
      })
      .onConflictDoNothing();
  }
}

beforeAll(async () => {
  app = await bootTestApp();
});

afterAll(async () => {
  await app.close();
});

const acceptances = (investorId: string) =>
  app.db.db
    .select()
    .from(consentRecords)
    .where(
      and(
        eq(consentRecords.investorId, investorId),
        eq(consentRecords.kind, 'DOCUMENT_ACCEPTANCE'),
      ),
    );

describe('legal.acceptPending (R-18, LEG-1)', () => {
  it('records one APP acceptance per pending key at the version shown, which clears them from legal.pending', async () => {
    await seedDocs();
    const { investor, req } = await signedInInvestor(app);
    const res = await req.post('/api/v1/legal/pending/accept', {
      accept: [
        { key: 'TNC', version: '1' },
        { key: 'PRIVACY_NOTICE', version: '1' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const after = ((await req.get('/api/v1/legal/pending')).body as Array<{ key: string }>).map(
      (d) => d.key,
    );
    expect(after).not.toContain('TNC');
    expect(after).not.toContain('PRIVACY_NOTICE');
    expect(after).toContain('RISK_DISCLOSURE');
    const rows = await acceptances(investor.id);
    expect(rows.map((r) => r.documentKey).sort()).toEqual(['PRIVACY_NOTICE', 'TNC']);
    expect(rows.every((r) => r.channel === 'APP' && r.sessionId !== null)).toBe(true);
  });

  it('writes no row for a key that is not pending, so a repeat call adds no duplicate', async () => {
    await seedDocs();
    const { investor, req } = await signedInInvestor(app);
    await req.post('/api/v1/legal/pending/accept', { accept: [{ key: 'TNC', version: '1' }] });
    const again = await req.post('/api/v1/legal/pending/accept', {
      accept: [{ key: 'TNC', version: '1' }],
    });
    expect(again.status).toBe(200);
    expect((await acceptances(investor.id)).map((r) => r.documentKey)).toEqual(['TNC']);
  });

  it('refuses an empty list, an unknown key, a missing version and the old keys-only shape', async () => {
    const { req } = await signedInInvestor(app);
    const post = (body: unknown) => req.post('/api/v1/legal/pending/accept', body);
    expect((await post({ accept: [] })).status).toBe(400);
    expect((await post({ accept: [{ key: 'NOPE', version: '1' }] })).status).toBe(400);
    expect((await post({ accept: [{ key: 'TNC' }] })).status).toBe(400);
    expect((await post({ keys: ['TNC'] })).status).toBe(400);
  });

  it('refuses with DECLARATION_OUTDATED, and writes no consent row at all, when a version is no longer current', async () => {
    await seedDocs();
    const { investor, req } = await signedInInvestor(app);
    const pending = (await req.get('/api/v1/legal/pending')).body as Array<{
      key: string;
      version: string;
    }>;
    const shown = pending.filter((d) => d.key === 'TNC' || d.key === 'PRIVACY_NOTICE');
    expect(shown).toHaveLength(2);
    // Ops publishes TNC v2 while the sheet showing v1 is open.
    app.clock.advance(60_000);
    await app.db.db.insert(legalDocuments).values({
      createdBy: 'test',
      updatedBy: 'test',
      key: 'TNC',
      version: '2',
      bodyMarkdown: '# TNC v2',
      sha256: Buffer.alloc(32, 2),
      status: 'PUBLISHED',
      effectiveFrom: app.clock.now(),
    });
    const res = await req.post('/api/v1/legal/pending/accept', {
      accept: shown.map(({ key, version }) => ({ key, version })),
    });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'DECLARATION_OUTDATED' });
    expect(await acceptances(investor.id)).toEqual([]);
    // Re-sending the version now in force succeeds.
    const retry = await req.post('/api/v1/legal/pending/accept', {
      accept: [
        { key: 'TNC', version: '2' },
        { key: 'PRIVACY_NOTICE', version: '1' },
      ],
    });
    expect(retry.status).toBe(200);
    expect((await acceptances(investor.id)).map((r) => r.documentKey).sort()).toEqual([
      'PRIVACY_NOTICE',
      'TNC',
    ]);
  });
});

describe('legal.commissionRates (CAT-2)', () => {
  it('returns the scheme and AMC names, not only ids, and a null scheme name for an AMC-scoped row', async () => {
    const stamp = `${Date.now()}-${Math.random()}`;
    const [amc] = await app.db.db
      .insert(amcs)
      .values({ name: 'Disclosure AMC', slug: `d-amc-${stamp}` })
      .returning();
    const [otherAmc] = await app.db.db
      .insert(amcs)
      .values({ name: 'Wide AMC', slug: `w-amc-${stamp}` })
      .returning();
    const [category] = await app.db.db
      .insert(sebiCategories)
      .values({
        code: `CAT_${stamp}`,
        assetClass: 'EQUITY',
        name: 'Flexi Cap',
        slug: `cat-${stamp}`,
        cutoffClass: 'STANDARD',
        volatilityClass: 'V_EQUITY',
      })
      .returning();
    if (!amc || !otherAmc || !category) throw new Error('seed failed');
    const [scheme] = await app.db.db
      .insert(schemes)
      .values({
        isin: `INF${String(Date.now()).slice(-9)}`,
        amcId: amc.id,
        name: 'Disclosure Flexi Cap Fund - Regular - Growth',
        slug: `scheme-${stamp}`,
        categoryCode: category.code,
        status: 'PUBLISHED',
        curated: true,
        thresholds: {
          purchaseMin: '500.00',
          purchaseMax: null,
          purchaseMultiple: '1.00',
          sipMin: '500.00',
          sipMax: null,
          sipMultiple: '1.00',
        },
      })
      .returning();
    if (!scheme) throw new Error('seed failed');
    await app.db.db.insert(commissionDisclosures).values([
      {
        schemeId: scheme.id,
        disclosureKey: `scheme-${stamp}`,
        trailMinBps: 75,
        trailMaxBps: 75,
        kind: 'EXACT',
        effectiveFrom: '2026-01-01',
        source: 'AMC letter',
      },
      {
        amcId: otherAmc.id,
        disclosureKey: `amc-${stamp}`,
        trailMinBps: 50,
        trailMaxBps: 100,
        kind: 'RANGE',
        effectiveFrom: '2026-01-01',
        source: 'AMC letter',
      },
    ]);
    const { req } = await signedInInvestor(app);
    const res = await req.get('/api/v1/legal/commission-rates');
    expect(res.status).toBe(200);
    expect(res.body).toContainEqual({
      amcId: null,
      schemeId: scheme.id,
      schemeName: 'Disclosure Flexi Cap Fund - Regular - Growth',
      amcName: 'Disclosure AMC',
      minBps: 75,
      maxBps: 75,
      kind: 'EXACT',
    });
    expect(res.body).toContainEqual({
      amcId: otherAmc.id,
      schemeId: null,
      schemeName: null,
      amcName: 'Wide AMC',
      minBps: 50,
      maxBps: 100,
      kind: 'RANGE',
    });
  });
});
