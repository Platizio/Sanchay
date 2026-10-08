import { LEGAL_DOCUMENT_TITLES } from '@sanchay/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  consentRecords,
  declarationStagings,
  legalDocuments,
} from '../../src/modules/legal-consent/legal-consent.schema.js';
import { nominationDecisions } from '../../src/modules/onboarding/nomination.schema.js';
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

// Dated by the FakeClock (LegalDocs.current reads it), one second later per call, so a version-1 row a
// call inserts is the one in force (RV-03-54).
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

const titled = (key: (typeof REQUIRED)[number] | 'KYC_CONSENT', version = '1') => ({
  key,
  version,
  title: LEGAL_DOCUMENT_TITLES[key],
});

beforeAll(async () => {
  app = await bootTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('legal.pending', () => {
  it('lists only unaccepted current versions, with their titles', async () => {
    await seedDocs();
    const { req } = await signedInInvestor(app);
    const before = await req.get('/api/v1/legal/pending');
    expect(before.body).toEqual([...REQUIRED, 'KYC_CONSENT' as const].map((key) => titled(key)));
    await req.post('/api/v1/onboarding/declarations', {
      accept: REQUIRED.map((key) => ({ key, version: '1' })),
    });
    const after = await req.get('/api/v1/legal/pending');
    expect(after.body).toEqual([titled('KYC_CONSENT')]);
  });
});

describe('onboarding.stageDeclarations', () => {
  it('rejects a stale version acceptance', async () => {
    await seedDocs();
    const { req } = await signedInInvestor(app);
    await app.db.db
      .update(legalDocuments)
      .set({ version: '2' })
      .where(eq(legalDocuments.key, 'TNC'));
    const res = await req.post('/api/v1/onboarding/declarations', {
      accept: REQUIRED.map((key) => ({ key, version: '1' })),
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('DECLARATION_OUTDATED');
  });

  it('requires NOMINATION_OPT_OUT_ANNEX_B only when the investor opted out', async () => {
    await seedDocs();
    const { investor, req } = await signedInInvestor(app);
    await app.db.db.insert(nominationDecisions).values({
      investorId: investor.id,
      createdBy: 'system:test',
      updatedBy: 'system:test',
      decision: 'OPTED_OUT',
      decidedAt: new Date(),
    });
    const withoutAnnex = await req.post('/api/v1/onboarding/declarations', {
      accept: REQUIRED.map((key) => ({ key, version: '1' })),
    });
    expect(withoutAnnex.status).toBe(400);

    const withAnnex = await req.post('/api/v1/onboarding/declarations', {
      accept: [
        ...REQUIRED.map((key) => ({ key, version: '1' })),
        { key: 'NOMINATION_OPT_OUT_ANNEX_B', version: '1' },
      ],
    });
    expect(withAnnex.status).toBe(200);
    const rows = await app.db.db
      .select()
      .from(declarationStagings)
      .where(
        and(
          eq(declarationStagings.investorId, investor.id),
          isNull(declarationStagings.supersededAt),
        ),
      );
    expect(rows.map((r) => r.documentKey).sort()).toEqual(
      [...REQUIRED, 'NOMINATION_OPT_OUT_ANNEX_B'].sort(),
    );
  });

  it('does not restage KYC_CONSENT (already recorded at ONB-02 by E6)', async () => {
    await seedDocs();
    const { investor, req } = await signedInInvestor(app);
    const res = await req.post('/api/v1/onboarding/declarations', {
      accept: REQUIRED.map((key) => ({ key, version: '1' })),
    });
    expect(res.status).toBe(200);
    const staged = await app.db.db
      .select()
      .from(declarationStagings)
      .where(eq(declarationStagings.investorId, investor.id));
    expect(staged.some((r) => (r.documentKey as string) === 'KYC_CONSENT')).toBe(false);
  });

  it('stages only the pending keys when the rest are held at their current version (RV-03-54)', async () => {
    await seedDocs();
    const { req } = await signedInInvestor(app);
    await req.post('/api/v1/onboarding/declarations', {
      accept: REQUIRED.map((key) => ({ key, version: '1' })),
    });
    const again = await req.post('/api/v1/onboarding/declarations', {
      accept: [{ key: 'TNC', version: '1' }],
    });
    expect(again.status).toBe(200);
  });
});

describe('legal.commissionRates', () => {
  it('resolves without the Plan-02 catalogue table (empty until D9 binds the real source)', async () => {
    const { req } = await signedInInvestor(app); // TestApp has no `request` (RV-03-33)
    const res = await req.get('/api/v1/legal/commission-rates');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('legal.acceptPending (R-18)', () => {
  const keysOf = (body: Array<{ key: string }>) => body.map((d) => d.key);
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

  it('records one APP acceptance per pending key, which clears them from legal.pending', async () => {
    await seedDocs();
    const { investor, req } = await signedInInvestor(app);
    expect(keysOf((await req.get('/api/v1/legal/pending')).body)).toEqual(
      expect.arrayContaining(['TNC', 'PRIVACY_NOTICE']),
    );
    const res = await req.post('/api/v1/legal/pending/accept', {
      keys: ['TNC', 'PRIVACY_NOTICE'],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const after = keysOf((await req.get('/api/v1/legal/pending')).body);
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
    await req.post('/api/v1/legal/pending/accept', { keys: ['TNC'] });
    const again = await req.post('/api/v1/legal/pending/accept', {
      keys: ['TNC', 'INVESTOR_CHARTER'],
    });
    expect(again.status).toBe(200);
    expect((await acceptances(investor.id)).map((r) => r.documentKey)).toEqual(['TNC']);
  });

  it('refuses an empty key list and an unknown key', async () => {
    const { req } = await signedInInvestor(app);
    expect((await req.post('/api/v1/legal/pending/accept', { keys: [] })).status).toBe(400);
    expect((await req.post('/api/v1/legal/pending/accept', { keys: ['NOPE'] })).status).toBe(400);
  });
});

// Last in the file: it publishes TNC version 3 into the shared test database ('rejects a stale version
// acceptance' already turned the first TNC row into version 2).
describe('legal.pending after a re-accept (R-18)', () => {
  it('clears a key once its new version is accepted through E13 legal.acceptPending', async () => {
    await seedDocs();
    const { investor, req } = await signedInInvestor(app);
    await req.post('/api/v1/onboarding/declarations', {
      accept: REQUIRED.map((key) => ({ key, version: '1' })),
    });
    app.clock.advance(60_000);
    await app.db.db.insert(legalDocuments).values({
      createdBy: 'test',
      updatedBy: 'test',
      key: 'TNC',
      version: '3',
      bodyMarkdown: '# TNC v3',
      sha256: Buffer.alloc(32, 3),
      status: 'PUBLISHED',
      effectiveFrom: app.clock.now(),
    });
    const stale = await req.get('/api/v1/legal/pending');
    expect(stale.body).toContainEqual(titled('TNC', '3'));
    app.clock.advance(60_000);
    // The row E13's legal.acceptPending writes through LegalDocs.recordAcceptance.
    await app.db.db.insert(consentRecords).values({
      createdBy: investor.id,
      kind: 'DOCUMENT_ACCEPTANCE',
      investorId: investor.id,
      documentKey: 'TNC',
      channel: 'APP',
      consumedAt: app.clock.now(),
    });
    const after = await req.get('/api/v1/legal/pending');
    expect(after.body).toEqual([titled('KYC_CONSENT')]);
  });
});
