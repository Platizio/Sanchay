import type { ClsService } from 'nestjs-cls';
import { describe, expect, it } from 'vitest';
import type { SanchayClsStore } from '../../../modules/platform/request-context.js';
import type { ConsumedConsent } from '../consumed-consent.js';
import { FpAmbiguousError } from '../fp-errors.js';
import { FpTokenCache } from '../fp-token-cache.js';
import { FpTransport } from '../fp-transport.js';
import { FakeFp } from './fake-fp.js';

const BASE_URLS = {
  fp: 'https://fp.fake.local',
  poa: 'https://poa.fake.local',
  pg: 'https://pg.fake.local',
};

const CREDENTIALS = {
  tenantId: 'sanchay',
  fp: { clientId: 'fake', clientSecret: 'fake' },
  poa: { clientId: 'fake', clientSecret: 'fake' },
  pg: { clientId: 'fake', clientSecret: 'fake' },
};

function noopCls(): ClsService<SanchayClsStore> {
  return { get: () => false } as unknown as ClsService<SanchayClsStore>;
}

function transportFor(fakeFp: FakeFp): FpTransport {
  return new FpTransport(
    BASE_URLS,
    new FpTokenCache(BASE_URLS, CREDENTIALS, fakeFp.agent),
    fakeFp.agent,
    noopCls(),
    async () => {},
  );
}

function consent(): ConsumedConsent {
  return {
    challengeId: 'chal-1',
    investorId: 'inv-1',
    subjectType: 'PURCHASE',
    subjectIds: ['order-1'],
    snapshotSha256: 'a'.repeat(64),
    executeBefore: new Date('2027-01-01T00:00:00Z'),
  } as unknown as ConsumedConsent;
}

describe('FakeFp', () => {
  it('records the class of every call it serves', async () => {
    const fakeFp = new FakeFp(BASE_URLS);
    const transport = transportFor(fakeFp);
    await transport.call('schemePlans.list', {});
    await transport.call('preVerification.create', {
      body: {
        pan: { value: 'AAAPA3751A' },
        name: { value: 'Rani Gupta' },
        date_of_birth: { value: '1955-10-25' },
      },
    });
    expect(fakeFp.calls({ class: 'R' })).toHaveLength(1);
    expect(fakeFp.calls({ class: 'K' })).toHaveLength(1);
    expect(fakeFp.calls({ op: 'schemePlans.list' })).toHaveLength(1);
  });

  it('verifies the bank accounts a pre-verification carries, so a local bank check can settle', async () => {
    const fakeFp = new FakeFp(BASE_URLS);
    const transport = transportFor(fakeFp);
    const created = await transport.call('preVerification.create', {
      body: {
        pan: { value: 'AAAPA3751A' },
        name: { value: 'Rani Gupta' },
        date_of_birth: { value: '1955-10-25' },
        bank_accounts: [{ value: { account_number: '50100123456789', ifsc_code: 'HDFC0000123' } }],
      },
    });
    const id = (created.body as { id: string }).id;
    const fetched = await transport.call('preVerification.get', { pathParams: { id } });
    expect((fetched.body as { bank_accounts: unknown }).bank_accounts).toEqual([
      { status: 'verified', code: null },
    ]);
  });

  it('lists 10 scheme fixtures covering liquid, ELSS, equity and debt', async () => {
    const fakeFp = new FakeFp(BASE_URLS);
    const transport = transportFor(fakeFp);
    const result = await transport.call('schemePlans.list', {});
    const body = result.body as { data: Array<{ isin: string }> };
    expect(body.data).toHaveLength(10);
    expect(new Set(body.data.map((s) => s.isin)).size).toBe(10);
  });

  it('LOOKUP-ADOPT: a purchase created before a scripted timeout is found by listing the investment account', async () => {
    const fakeFp = new FakeFp(BASE_URLS);
    const transport = transportFor(fakeFp);
    fakeFp.script('purchase.create', 'timeout');
    await expect(
      transport.call('purchase.create', {
        body: {
          source_ref_id: 'order-lookup-1',
          mf_investment_account: 'mfia_1',
          scheme: 'INF209K01157',
          amount: '1500.00',
        },
        consent: consent(),
      }),
    ).rejects.toBeInstanceOf(FpAmbiguousError);
    // R-46: list by the filter FP documents (mf_investment_account) and match source_ref_id locally.
    const list = await transport.call('purchase.list', {
      query: { mf_investment_account: 'mfia_1' },
    });
    const body = list.body as { data: Array<{ source_ref_id: string; state: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.source_ref_id).toBe('order-lookup-1');
    expect(body.data[0]?.state).toBe('under_review');
  });

  it('a scripted 4xx creates no object, so a later list of the account is empty (final review MF-5)', async () => {
    const fakeFp = new FakeFp(BASE_URLS);
    const transport = transportFor(fakeFp);
    fakeFp.script('purchase.create', {
      status: 422,
      body: { error: { status: 422, code: 'UNPROCESSABLE', message: 'rejected' } },
    });
    await expect(
      transport.call('purchase.create', {
        body: {
          source_ref_id: 'order-422',
          mf_investment_account: 'mfia_1',
          scheme: 'INF209K01157',
          amount: '1500.00',
        },
        consent: consent(),
      }),
    ).rejects.toMatchObject({ httpStatus: 422 });
    const list = await transport.call('purchase.list', {
      query: { mf_investment_account: 'mfia_1' },
    });
    expect((list.body as { data: unknown[] }).data).toEqual([]);
    expect(fakeFp.calls({ op: 'purchase.create' })).toHaveLength(1);
  });

  it('purchase.list ignores source_ref_id and plan', async () => {
    // R-46: FP documents only the mf_investment_account filter (research fp-api.md:159). FakeFp honours
    // that one and ignores the rest, so a caller that trusts an undocumented filter fails here.
    const fakeFp = new FakeFp(BASE_URLS);
    const transport = transportFor(fakeFp);
    for (const [ref, account] of [
      ['order-a', 'mfia_1'],
      ['order-b', 'mfia_1'],
      ['order-c', 'mfia_2'],
    ] as const) {
      await transport.call('purchase.create', {
        body: {
          source_ref_id: ref,
          mf_investment_account: account,
          scheme: 'INF209K01157',
          amount: '1500.00',
        },
        consent: consent(),
      });
    }
    const refsOf = (body: unknown) =>
      (body as { data: Array<{ source_ref_id: string }> }).data.map((p) => p.source_ref_id).sort();
    const bySourceRef = await transport.call('purchase.list', {
      query: { source_ref_id: 'order-a' },
    });
    expect(refsOf(bySourceRef.body)).toEqual(['order-a', 'order-b', 'order-c']);
    const byPlan = await transport.call('purchase.list', { query: { plan: 'mfpp_1' } });
    expect(refsOf(byPlan.body)).toEqual(['order-a', 'order-b', 'order-c']);
    const byAccount = await transport.call('purchase.list', {
      query: { mf_investment_account: 'mfia_1', source_ref_id: 'order-c', plan: 'mfpp_1' },
    });
    expect(refsOf(byAccount.body)).toEqual(['order-a', 'order-b']);
  });

  it('H-2 lumpsum state path: under_review -> pending -> submitted -> successful', async () => {
    const fakeFp = new FakeFp(BASE_URLS);
    const transport = transportFor(fakeFp);
    const created = await transport.call('purchase.create', {
      body: {
        source_ref_id: 'order-h2-1',
        mf_investment_account: 'mfia_1',
        scheme: 'INF209K01157',
        amount: '1500.00',
      },
      consent: consent(),
    });
    const id = (created.body as { id: string }).id;
    expect((created.body as { state: string }).state).toBe('under_review');
    fakeFp.advance(id, 'pending');
    const withConsent = await transport.call('purchase.update', {
      body: { id, consent: { email: 'a@example.com' } },
      consent: consent(),
    });
    expect((withConsent.body as { state: string }).state).toBe('pending');
    const confirmed = await transport.call('purchase.update', {
      body: { id, state: 'confirmed' },
      consent: consent(),
    });
    expect((confirmed.body as { state: string }).state).toBe('submitted');
    fakeFp.advance(id, 'successful', { folioNumber: '12345/67' });
    const fetched = await transport.call('purchase.get', { pathParams: { id } });
    expect((fetched.body as { state: string; folio_number: string }).state).toBe('successful');
    expect((fetched.body as { folio_number: string }).folio_number).toBe('12345/67');
    // FP's GET carries the consent the PATCH set.
    expect((fetched.body as { consent: unknown }).consent).toEqual({ email: 'a@example.com' });
  });

  it('rejects a second live payment against the same order (H-2 "no multiple payments")', async () => {
    const fakeFp = new FakeFp(BASE_URLS);
    const transport = transportFor(fakeFp);
    const created = await transport.call('purchase.create', {
      body: {
        source_ref_id: 'order-pay-1',
        mf_investment_account: 'mfia_1',
        scheme: 'INF209K01157',
        amount: '1500.00',
      },
      consent: consent(),
    });
    // fpJson parses numbers losslessly: send the plain JSON number back, as the real client will.
    const oldId = Number(String((created.body as { old_id: unknown }).old_id));
    await transport.call('payment.create', {
      body: { amc_order_ids: [oldId], method: 'UPI', bank_account_id: 1 },
      consent: consent(),
    });
    const failure = await transport
      .call('payment.create', {
        body: { amc_order_ids: [oldId], method: 'UPI', bank_account_id: 1 },
        consent: consent(),
      })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FpAmbiguousError);
  });

  it('rejects any M-class body that carries a partner or euin key (H-11)', async () => {
    const fakeFp = new FakeFp(BASE_URLS);
    const transport = transportFor(fakeFp);
    await expect(
      transport.call('purchase.create', {
        body: {
          source_ref_id: 'order-h11-1',
          mf_investment_account: 'mfia_1',
          scheme: 'INF209K01157',
          amount: '1500.00',
          euin: null,
        },
        consent: consent(),
      }),
    ).rejects.toMatchObject({ providerCode: 'PARTNER_OR_EUIN_NOT_ALLOWED' });
    await expect(
      transport.call('purchase.create', {
        body: {
          source_ref_id: 'order-h11-2',
          mf_investment_account: 'mfia_1',
          scheme: 'INF209K01157',
          amount: '1500.00',
          partner: 'ptnr_1',
        },
        consent: consent(),
      }),
    ).rejects.toMatchObject({ providerCode: 'PARTNER_OR_EUIN_NOT_ALLOWED' });
  });
});
