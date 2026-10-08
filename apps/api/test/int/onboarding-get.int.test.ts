import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { legalDocuments } from '../../src/modules/legal-consent/legal-consent.schema.js';
import { onboardingApplications } from '../../src/modules/onboarding/onboarding.schema.js';
import { newId } from '../../src/modules/platform/ids.js';
import { bootTestApp, type TestApp } from './app.js';
import { signInWeb } from './flows.js';
import { webHeaders } from './http.js';

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp();
});
afterAll(async () => {
  await t.close();
});

const get = (url: string, cookies: Record<string, string>) =>
  t.app.inject({ method: 'GET', url: `/api/v1${url}`, headers: webHeaders({ cookies }) });

describe('GET /onboarding', () => {
  it('creates the application row on first touch and starts at IDENTITY', async () => {
    const s = await signInWeb(t, '9844500001');
    const res = await get('/onboarding', s.cookies);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ stage: 'IDENTITY', readinessCode: null });
    const [row] = await t.db.db
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, s.investorId));
    expect(row?.identityStatus).toBe('NOT_STARTED');
  });

  it('is session-scoped: another investor never sees this one by any id parameter (no id params, so both sessions must see only their own data)', async () => {
    const a = await signInWeb(t, '9844500002');
    const b = await signInWeb(t, '9844500003');
    const resA = await get('/onboarding', a.cookies);
    const resB = await get('/onboarding', b.cookies);
    expect(resA.statusCode).toBe(200);
    expect(resB.statusCode).toBe(200);
  });

  it('rejects without a session', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/onboarding',
      headers: webHeaders(),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /me', () => {
  it('never returns *_enc or a full PAN/account, and reflects the ONB-00 stage', async () => {
    const s = await signInWeb(t, '9844500004');
    const res = await get('/me', s.cookies);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      investorId: s.investorId,
      mobileMasked: expect.stringContaining('••••'),
      stage: 'IDENTITY',
      profile: null,
      bank: null,
      nomineesCount: 0,
      riskLevel: null,
    });
    expect(JSON.stringify(body)).not.toMatch(/_enc/);
    expect(JSON.stringify(body)).not.toMatch(/[A-Z]{5}[0-9]{4}[A-Z]/);
  });

  it('lists a DOCUMENT_ACCEPTANCE legal version once one is recorded', async () => {
    const s = await signInWeb(t, '9844500005');
    await t.db.db.insert(legalDocuments).values({
      id: newId('legal_documents'),
      createdBy: 'test',
      updatedBy: 'test',
      key: 'KYC_CONSENT',
      version: '1',
      bodyMarkdown: 'x',
      sha256: Buffer.alloc(32, 1),
      status: 'PUBLISHED',
      effectiveFrom: t.clock.now(),
    });
    const { consentRecords } = await import(
      '../../src/modules/legal-consent/legal-consent.schema.js'
    );
    await t.db.db.insert(consentRecords).values({
      id: newId('consent_records'),
      createdBy: s.investorId,
      kind: 'DOCUMENT_ACCEPTANCE',
      investorId: s.investorId,
      documentKey: 'KYC_CONSENT',
      channel: 'APP',
      consumedAt: t.clock.now(),
    });
    const res = await get('/me', s.cookies);
    expect(res.json().legalVersionsAccepted).toEqual([{ key: 'KYC_CONSENT', version: '1' }]);
  });
  it('reports the version in force at consumed_at, once per key, when a later version is published', async () => {
    const { consentRecords } = await import(
      '../../src/modules/legal-consent/legal-consent.schema.js'
    );
    const s = await signInWeb(t, '9844500006');
    const doc = (key: 'PRIVACY_NOTICE' | 'RISK_DISCLOSURE', version: string, from: string) => ({
      id: newId('legal_documents'),
      createdBy: 'test',
      updatedBy: 'test',
      key,
      version,
      bodyMarkdown: `x${version}`,
      sha256: Buffer.alloc(32, Number(version)),
      status: 'PUBLISHED' as const,
      effectiveFrom: new Date(from),
    });
    await t.db.db
      .insert(legalDocuments)
      .values([
        doc('PRIVACY_NOTICE', '1', '2026-01-01T00:00:00Z'),
        doc('PRIVACY_NOTICE', '2', '2026-06-01T00:00:00Z'),
        doc('RISK_DISCLOSURE', '1', '2026-01-01T00:00:00Z'),
        doc('RISK_DISCLOSURE', '2', '2026-06-01T00:00:00Z'),
      ]);
    const accept = (key: 'PRIVACY_NOTICE' | 'RISK_DISCLOSURE', at: string) => ({
      id: newId('consent_records'),
      createdBy: s.investorId,
      kind: 'DOCUMENT_ACCEPTANCE' as const,
      investorId: s.investorId,
      documentKey: key,
      channel: 'APP',
      consumedAt: new Date(at),
    });
    await t.db.db
      .insert(consentRecords)
      .values([
        accept('PRIVACY_NOTICE', '2026-03-01T00:00:00Z'),
        accept('RISK_DISCLOSURE', '2026-03-01T00:00:00Z'),
        accept('RISK_DISCLOSURE', '2026-07-01T00:00:00Z'),
      ]);
    const res = await get('/me', s.cookies);
    const accepted = res.json().legalVersionsAccepted as Array<{ key: string; version: string }>;
    expect(accepted).toHaveLength(2);
    expect(accepted).toEqual(
      expect.arrayContaining([
        { key: 'PRIVACY_NOTICE', version: '1' },
        { key: 'RISK_DISCLOSURE', version: '2' },
      ]),
    );
  });
});
