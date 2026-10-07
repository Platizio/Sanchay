import type { ClsService } from 'nestjs-cls';
import { MockAgent } from 'undici';
import { describe, expect, it, vi } from 'vitest';
import type { SanchayClsStore } from '../../modules/platform/request-context.js';
import type { ConsumedConsent } from './consumed-consent.js';
import {
  ConsentNotConsumedError,
  FpAmbiguousError,
  FpRejectedError,
  ProviderCallInTransactionError,
} from './fp-errors.js';
import { FpTokenCache } from './fp-token-cache.js';
import { FpTransport } from './fp-transport.js';

const BASE_URLS = {
  fp: 'https://fp.fake.local',
  poa: 'https://poa.fake.local',
  pg: 'https://pg.fake.local',
};
const CREDENTIALS = {
  tenantId: 'sanchay',
  fp: { clientId: 'fp-id', clientSecret: 'fp-secret' },
  poa: { clientId: 'poa-id', clientSecret: 'poa-secret' },
  pg: { clientId: 'pg-id', clientSecret: 'pg-secret' },
};

function clsWith(dbInTx: boolean): ClsService<SanchayClsStore> {
  return {
    get: (key: string) => (key === 'dbInTx' ? dbInTx : undefined),
  } as unknown as ClsService<SanchayClsStore>;
}

function recorder() {
  const entries: unknown[] = [];
  const record = vi.fn(async (entry: unknown) => {
    entries.push(entry);
  });
  return { record, entries };
}

function agentWithToken(): MockAgent {
  const agent = new MockAgent();
  agent.disableNetConnect();
  agent
    .get('https://fp.fake.local')
    .intercept({ path: '/v2/auth/sanchay/token', method: 'POST' })
    .reply(200, { access_token: 'tok', expires_in: 1800 })
    .persist();
  return agent;
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

describe('FpTransport.call', () => {
  it('refuses to run inside a transaction', async () => {
    const agent = agentWithToken();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(true),
      recorder().record,
    );
    await expect(transport.call('schemePlans.list', {})).rejects.toBeInstanceOf(
      ProviderCallInTransactionError,
    );
  });

  it('rejects a P/M call with no consent, at runtime, even past the type check', async () => {
    const agent = agentWithToken();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      recorder().record,
    );
    // @ts-expect-error consent is required for an M-class operation
    await expect(transport.call('purchase.create', { body: {} })).rejects.toBeInstanceOf(
      ConsentNotConsumedError,
    );
  });

  it('maps a timeout to FpAmbiguousError', async () => {
    const agent = agentWithToken();
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/mf_purchases', method: 'POST' })
      .replyWithError(new Error('simulated timeout'));
    const { record } = recorder();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      record,
    );
    await expect(
      transport.call('purchase.create', { body: { source_ref_id: 'o-1' }, consent: consent() }),
    ).rejects.toBeInstanceOf(FpAmbiguousError);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'TRANSPORT_ERROR' }));
  });

  it('maps a 409 duplicate source_ref_id to FpAmbiguousError', async () => {
    const agent = agentWithToken();
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/mf_purchases', method: 'POST' })
      .reply(409, {
        error: { status: 409, code: 'DUPLICATE_SOURCE_REF_ID', message: 'already exists' },
      });
    const { record } = recorder();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      record,
    );
    await expect(
      transport.call('purchase.create', { body: { source_ref_id: 'o-1' }, consent: consent() }),
    ).rejects.toBeInstanceOf(FpAmbiguousError);
  });

  it('maps a 400 to FpRejectedError with the provider code', async () => {
    const agent = agentWithToken();
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/mf_purchases', method: 'POST' })
      .reply(400, { error: { status: 400, code: 'INVALID_SCHEME', message: 'unknown scheme' } });
    const { record } = recorder();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      record,
    );
    const failure = await transport
      .call('purchase.create', { body: { source_ref_id: 'o-1' }, consent: consent() })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(FpRejectedError);
    expect((failure as FpRejectedError).providerCode).toBe('INVALID_SCHEME');
    expect((failure as FpRejectedError).httpStatus).toBe(400);
  });

  it('parses a successful response through fpJson and returns it', async () => {
    const agent = agentWithToken();
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/mf_scheme_plans/cybrillapoa/INF209KA1K47', method: 'GET' })
      .reply(200, { isin: 'INF209KA1K47', object: 'mf_scheme_plan' });
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      recorder().record,
    );
    const result = await transport.call('schemePlans.get', {
      pathParams: { isin: 'INF209KA1K47' },
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ isin: 'INF209KA1K47' });
  });
});
