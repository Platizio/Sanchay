import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { nominationDecisions, nominees } from '../../src/modules/onboarding/nomination.schema.js';
import { onboardingApplications } from '../../src/modules/onboarding/onboarding.schema.js';
import { bootTestApp, type TestApp } from './app.js';
import { webHeaders } from './http.js';
import { signedInInvestor } from './signed-in.js';

let app: TestApp;

beforeAll(async () => {
  app = await bootTestApp();
});

afterAll(async () => {
  await app.close();
});

const nominee = (position: number, allocationPct?: number) => ({
  name: `Nominee ${position}`,
  relationship: 'SPOUSE',
  isMinor: false,
  allocationPct,
});

describe('onboarding.putNomination / getNomination', () => {
  it('defaults to the equal split (34/33/33) for 3 nominees', async () => {
    const { req } = await signedInInvestor(app);
    const res = await req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: true,
      nominees: [nominee(1), nominee(2), nominee(3)],
    });
    expect(res.status).toBe(200);
    expect(res.body.nominees.map((n: { allocationPct: number }) => n.allocationPct)).toEqual([
      34, 33, 33,
    ]);
  });

  it('accepts a custom allocation that sums to 100', async () => {
    const { req } = await signedInInvestor(app);
    const res = await req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: false,
      nominees: [nominee(1, 60), nominee(2, 40)],
    });
    expect(res.status).toBe(200);
    expect(res.body.nominees.map((n: { allocationPct: number }) => n.allocationPct)).toEqual([
      60, 40,
    ]);
  });

  it('rejects a set that sums to 99', async () => {
    const { req } = await signedInInvestor(app);
    const res = await req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: true,
      nominees: [nominee(1, 60), nominee(2, 39)],
    });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('NOMINATION_INVALID');
  });

  it('rejects a 4th nominee', async () => {
    const { req } = await signedInInvestor(app);
    const res = await req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: true,
      nominees: [nominee(1), nominee(2), nominee(3), nominee(4)],
    });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('NOMINATION_INVALID');
  });

  it('rejects AADHAAR_LAST4 as an id type', async () => {
    const { req } = await signedInInvestor(app);
    const res = await req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: true,
      nominees: [{ ...nominee(1), idType: 'AADHAAR_LAST4', idValue: '1234' }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a PAN id for a minor', async () => {
    const { req } = await signedInInvestor(app);
    const res = await req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: true,
      nominees: [
        {
          ...nominee(1),
          isMinor: true,
          dob: '2015-01-01',
          guardianName: 'Guardian One',
          idType: 'PAN',
          idValue: 'ABCDE1234F',
        },
      ],
    });
    expect(res.status).toBe(422);
  });

  it('increments set_version on a second PUT and replaces the prior set', async () => {
    const { investor, req } = await signedInInvestor(app);
    await req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: true,
      nominees: [nominee(1), nominee(2)],
    });
    const second = await req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: true,
      nominees: [nominee(1)],
    });
    expect(second.status).toBe(200);
    const rows = await app.db.db
      .select()
      .from(nominees)
      .where(eq(nominees.investorId, investor.id));
    expect(rows.filter((r) => r.status === 'REPLACED')).toHaveLength(2);
    expect(rows.filter((r) => r.status === 'CURRENT')).toHaveLength(1);
    expect(rows.find((r) => r.status === 'CURRENT')?.setVersion).toBe(2);
  });

  it('re-nominating after an opt-out never reuses a replaced set_version', async () => {
    const { investor, req } = await signedInInvestor(app);
    await req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: true,
      nominees: [nominee(1)],
    });
    const optOut = await req.put('/api/v1/onboarding/nomination', { decision: 'OPTED_OUT' });
    expect(optOut.status).toBe(200);
    expect(optOut.body.nominees).toEqual([]);
    const again = await req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: false,
      nominees: [nominee(1), nominee(2)],
    });
    expect(again.status).toBe(200);
    expect(again.body.setVersion).toBe(2);
    const rows = await app.db.db
      .select()
      .from(nominees)
      .where(eq(nominees.investorId, investor.id));
    expect(rows.filter((r) => r.status === 'CURRENT')).toHaveLength(2);
    expect(rows.filter((r) => r.status === 'REPLACED')).toHaveLength(1);
  });

  it('rejects an id type without an id value', async () => {
    const { req } = await signedInInvestor(app);
    const res = await req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: true,
      nominees: [{ ...nominee(1), idType: 'PASSPORT' }],
    });
    expect(res.status).toBe(422);
    expect(res.body.message).toBe('NOMINATION_INVALID');
  });
  it('OPTED_OUT is accepted without nominees and records the decision', async () => {
    const { investor, req } = await signedInInvestor(app);
    const res = await req.put('/api/v1/onboarding/nomination', {
      decision: 'OPTED_OUT',
    });
    expect(res.status).toBe(200);
    const [decision] = await app.db.db
      .select()
      .from(nominationDecisions)
      .where(eq(nominationDecisions.investorId, investor.id));
    expect(decision?.decision).toBe('OPTED_OUT');
    expect(decision?.displayPreference).toBeNull();
  });

  it('stores names encrypted, marks the step DONE and reads the set back', async () => {
    const { investor, req } = await signedInInvestor(app);
    await req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: true,
      nominees: [nominee(1), nominee(2)],
    });
    const [row] = await app.db.db
      .select()
      .from(nominees)
      .where(eq(nominees.investorId, investor.id))
      .orderBy(nominees.position);
    expect(row?.nameEnc.includes(Buffer.from('Nominee 1'))).toBe(false);
    expect(row?.nameLength).toBe('Nominee 1'.length);
    const [onboarding] = await app.db.db
      .select()
      .from(onboardingApplications)
      .where(eq(onboardingApplications.investorId, investor.id));
    expect(onboarding?.nominationStatus).toBe('DONE');
    const got = await req.get('/api/v1/onboarding/nomination');
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({
      decision: 'NOMINATED',
      displayPreference: true,
      setVersion: 1,
    });
    expect(got.body.nominees.map((n: { name: string }) => n.name)).toEqual([
      'Nominee 1',
      'Nominee 2',
    ]);
  });

  it('a fresh investor reads NOT_ASKED with no nominees', async () => {
    const { req } = await signedInInvestor(app);
    const res = await req.get('/api/v1/onboarding/nomination');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      decision: 'NOT_ASKED',
      displayPreference: null,
      setVersion: null,
      nominees: [],
    });
  });

  // RV-03-33. Neither procedure takes an id (both act on the session of the caller), so the generic
  // expectBola 404 probe has no foreign id to present. The BOLA property for these two procedures is that
  // the session is the only key: another investor can never read or overwrite this set.
  it('BOLA: onboarding.getNomination is session-scoped (RV-03-33)', async () => {
    const owner = await signedInInvestor(app);
    await owner.req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: true,
      nominees: [nominee(1)],
    });
    const other = await signedInInvestor(app);
    const res = await other.req.get('/api/v1/onboarding/nomination');
    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('NOT_ASKED');
    expect(res.body.nominees).toEqual([]);
  });

  it('BOLA: onboarding.putNomination never touches another investor (RV-03-33)', async () => {
    const owner = await signedInInvestor(app);
    await owner.req.put('/api/v1/onboarding/nomination', {
      decision: 'NOMINATED',
      displayPreference: true,
      nominees: [nominee(1)],
    });
    const other = await signedInInvestor(app);
    await other.req.put('/api/v1/onboarding/nomination', { decision: 'OPTED_OUT' });
    const ownerView = await owner.req.get('/api/v1/onboarding/nomination');
    expect(ownerView.body.decision).toBe('NOMINATED');
    expect(ownerView.body.nominees).toHaveLength(1);
  });

  it('refuses both procedures without a session', async () => {
    const get = await app.app.inject({
      method: 'GET',
      url: '/api/v1/onboarding/nomination',
      headers: webHeaders(),
    });
    expect(get.statusCode).toBe(401);
    const put = await app.app.inject({
      method: 'PUT',
      url: '/api/v1/onboarding/nomination',
      headers: webHeaders(),
      payload: { decision: 'OPTED_OUT' },
    });
    expect(put.statusCode).toBe(401);
  });
});

describe('nominees_set_sum deferred trigger', () => {
  it('rejects a CURRENT set that sums to 99 at commit', async () => {
    const { investor } = await signedInInvestor(app);
    const row = (position: number, allocationPct: number) => ({
      createdBy: 'system:test',
      updatedBy: 'system:test',
      investorId: investor.id,
      setVersion: 1,
      position,
      nameEnc: Buffer.from('x'),
      nameLength: 1,
      relationship: 'SPOUSE' as const,
      allocationPct,
    });
    // The statements succeed; only the COMMIT fails, because the constraint trigger is deferred.
    const failure: unknown = await app.db.db
      .transaction(async (tx) => {
        await tx.insert(nominees).values(row(1, 60));
        await tx.insert(nominees).values(row(2, 39));
      })
      .then(
        () => null,
        (err: unknown) => err,
      );
    expect(failure).not.toBeNull();
    const cause = (failure as { cause?: { code?: string; message?: string } }).cause;
    expect(cause?.code).toBe('23514');
    expect(cause?.message).toMatch(/sums to 99/);
  });
});
