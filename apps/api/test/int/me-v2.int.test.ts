import { istIsoDate } from '@sanchay/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  consentRecords,
  legalDocuments,
} from '../../src/modules/legal-consent/legal-consent.schema.js';
import { riskProfiles } from '../../src/modules/onboarding/risk-profile.schema.js';
import { DAY } from '../../src/modules/platform/clock.js';
import { newId } from '../../src/modules/platform/ids.js';
import { bootTestApp, type TestApp } from './app.js';
import { signInWeb } from './flows.js';
import { webHeaders } from './http.js';
import { seedReadyInvestor } from './onboarding-seed.js';

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp();
});
afterAll(async () => {
  await t.close();
});

const getMe = (cookies: Record<string, string>) =>
  t.app.inject({ method: 'GET', url: '/api/v1/me', headers: webHeaders({ cookies }) });

describe('me.get v2 (F14, R-18)', () => {
  it('returns the masked bank, the nominee set, the risk profile and the support contacts', async () => {
    const investor = await seedReadyInvestor(t);
    const res = await getMe(investor.cookies);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.bank).toEqual({
      bankName: null,
      accountLast4: expect.stringMatching(/^\d{4}$/),
      ifsc: 'HDFC0000123',
      status: 'VERIFIED',
    });
    expect(body.nomination).toEqual({
      decision: 'NOMINATED',
      nominees: [{ position: 1, relationship: 'SPOUSE', allocationPct: 100, isMinor: false }],
    });
    expect(body.nomineesCount).toBe(1);
    const [risk] = await t.db.db
      .select({ expiresAt: riskProfiles.expiresAt })
      .from(riskProfiles)
      .where(eq(riskProfiles.investorId, investor.investorId));
    expect(body.riskProfile).toEqual({
      level: 'MODERATE',
      status: 'ACTIVE',
      validUntil: istIsoDate(risk?.expiresAt ?? new Date(0)),
    });
    expect(body.riskLevel).toBe('MODERATE');
    expect(body.support).toEqual({
      email: 'support@sanchay.in',
      phone: null,
      grievanceEmail: 'grievance@sanchay.in',
    });
    // Masked only: no PAN, no account number (seedReadyInvestor's numbers start 1234567), no nominee name.
    const wire = JSON.stringify(body);
    expect(wire).not.toContain(investor.pan);
    expect(wire).not.toMatch(/1234567\d{5}/);
    expect(wire).not.toMatch(/_enc|Ravi Rao/);
    expect(body.profile.panMasked).toBe(`XXXXXX${investor.pan.slice(-4)}`);
  });

  it('reports an opt-out as a decision with no nominees, and its Annexure B acceptance', async () => {
    const investor = await seedReadyInvestor(t, { nominated: false });
    const body = (await getMe(investor.cookies)).json();
    expect(body.nomination).toEqual({ decision: 'OPTED_OUT', nominees: [] });
    expect(body.nomineesCount).toBe(0);
    expect(body.legalVersionsAccepted).toContainEqual({
      key: 'NOMINATION_OPT_OUT_ANNEX_B',
      version: '1',
    });
  });

  it('keeps E5 nulls for an investor who has not onboarded', async () => {
    const s = await signInWeb(t, '9844500101');
    const body = (await getMe(s.cookies)).json();
    expect(body).toMatchObject({
      bank: null,
      nomination: null,
      nomineesCount: 0,
      riskLevel: null,
      riskProfile: null,
      legalVersionsAccepted: [],
    });
  });

  // Last in the file: it publishes TNC version 2 into the shared test database.
  it('lists the version accepted per key: staged declarations, KYC consent and a later re-accept', async () => {
    const investor = await seedReadyInvestor(t);
    const accept = (documentKey: 'TNC' | 'KYC_CONSENT') =>
      t.db.db.insert(consentRecords).values({
        id: newId('consent_records'),
        createdBy: investor.investorId,
        kind: 'DOCUMENT_ACCEPTANCE',
        investorId: investor.investorId,
        documentKey,
        channel: 'APP',
        consumedAt: t.clock.now(),
      });
    await accept('KYC_CONSENT');
    t.clock.advance(DAY);
    await t.db.db.insert(legalDocuments).values({
      id: newId('legal_documents'),
      createdBy: 'test',
      updatedBy: 'test',
      key: 'TNC',
      version: '2',
      bodyMarkdown: '# TNC v2',
      sha256: Buffer.alloc(32, 9),
      status: 'PUBLISHED',
      effectiveFrom: t.clock.now(),
    });
    // E13's legal.acceptPending writes exactly this row.
    await accept('TNC');
    const body = (await getMe(investor.cookies)).json();
    const versions = new Map(
      (body.legalVersionsAccepted as Array<{ key: string; version: string }>).map((d) => [
        d.key,
        d.version,
      ]),
    );
    expect(versions.get('TNC')).toBe('2');
    expect(versions.get('KYC_CONSENT')).toBe('1');
    expect(versions.get('PRIVACY_NOTICE')).toBe('1');
    expect(versions.has('NOMINATION_OPT_OUT_ANNEX_B')).toBe(false);
    const keys = [...versions.keys()];
    expect(keys).toEqual([...keys].sort());
  });
});
