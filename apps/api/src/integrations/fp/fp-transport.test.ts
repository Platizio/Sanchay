import type { ClsService } from 'nestjs-cls';
import { type Dispatcher, MockAgent } from 'undici';
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

/**
 * undici resolves request() on the response headers, so a body timeout or socket reset surfaces
 * only while the body is read. This agent lets the headers through and then fails the body for the
 * purchase endpoint, as a real socket reset would.
 */
class BodyFailingAgent extends MockAgent {
  override dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler) {
    if (options.path !== '/v2/mf_purchases') return super.dispatch(options, handler);
    const inner = handler as unknown as {
      onError: (error: Error) => void;
      onData: (chunk: Buffer) => boolean;
      onComplete: (trailers: string[] | null) => void;
    };
    const wrapped = Object.create(handler as object) as typeof inner;
    wrapped.onData = () => true;
    wrapped.onComplete = () => {
      setImmediate(() => wrapped.onError(new Error('simulated body reset')));
    };
    return super.dispatch(options, wrapped as unknown as Dispatcher.DispatchHandler);
  }
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

  it('maps a body read failure after the headers arrive to FpAmbiguousError and records one row', async () => {
    const agent = new BodyFailingAgent();
    agent.disableNetConnect();
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/auth/sanchay/token', method: 'POST' })
      .reply(200, { access_token: 'tok', expires_in: 1800 })
      .persist();
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/mf_purchases', method: 'POST' })
      .reply(200, { id: 'pur-1', status: 'pending' });
    const { record, entries } = recorder();
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
    expect(failure).toBeInstanceOf(FpAmbiguousError);
    expect((failure as FpAmbiguousError).httpStatus).toBe(200);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      errorCode: 'TRANSPORT_ERROR',
      httpStatus: 200,
      operation: 'purchase.create',
    });
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

  it('keeps PAN, DOB and other FP snake_case PII out of request_meta and response_meta', async () => {
    const agent = agentWithToken();
    agent
      .get('https://poa.fake.local')
      .intercept({ path: '/v2/auth/cybrillarta/token', method: 'POST' })
      .reply(200, { access_token: 'tok', expires_in: 1800 })
      .persist();
    agent
      .get('https://poa.fake.local')
      .intercept({ path: '/poa/pre_verifications', method: 'POST' })
      .reply(201, {
        id: 'pv-1',
        object: 'pre_verification',
        status: 'pending',
        investor_identifier: 'ABCDE1234F',
        date_of_birth: { value: '1990-01-31' },
        primary_account_holder_name: 'Asha Rao',
        postal_code: '560001',
        user_ip: '203.0.113.9',
        ifsc_code: 'HDFC0000001',
      });
    const { record, entries } = recorder();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      record,
    );
    await transport.call('preVerification.create', {
      body: {
        investor_identifier: 'ABCDE1234F',
        pan: { value: 'ABCDE1234F' },
        name: { value: 'Asha Rao' },
        date_of_birth: { value: '1990-01-31' },
        unlisted_key: 'ABCDE1234F',
        bank_accounts: [{ value: { account_number: '123456789012', ifsc_code: 'HDFC0000001' } }],
      },
    });
    expect(entries).toHaveLength(1);
    const { requestMeta, responseMeta } = entries[0] as {
      requestMeta: unknown;
      responseMeta: unknown;
    };
    for (const meta of [JSON.stringify(requestMeta), JSON.stringify(responseMeta)]) {
      for (const secret of [
        'ABCDE1234F',
        '1990-01-31',
        'Asha Rao',
        '560001',
        '203.0.113.9',
        'HDFC0000001',
        '123456789012',
      ]) {
        expect(meta).not.toContain(secret);
      }
    }
    expect(responseMeta).toMatchObject({ id: 'pv-1', status: 'pending' });
  });

  /** Runs one P-class call whose scripted reply is the given body, and returns what was recorded. */
  async function recordedFor(
    op: 'phoneNumber.create' | 'investorProfile.create',
    path: string,
    reply: unknown,
  ): Promise<{ responseMeta: unknown }> {
    const agent = agentWithToken();
    agent
      .get('https://fp.fake.local')
      .intercept({ path, method: 'POST' })
      .reply(201, reply as never);
    const { record, entries } = recorder();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      record,
    );
    await transport.call(op, { body: {}, consent: consent() });
    return entries[0] as { responseMeta: unknown };
  }

  it('keeps a phone number out of response_meta although its key is only number (final review MF-3)', async () => {
    const { responseMeta } = await recordedFor('phoneNumber.create', '/v2/phone_numbers', {
      id: 'phn_1',
      object: 'phone_number',
      number: '9876543210',
      isd: '91',
    });
    expect(JSON.stringify(responseMeta)).not.toContain('9876543210');
    expect(responseMeta).toMatchObject({ id: 'phn_1', object: 'phone_number' });
  });

  it('keeps a PAN in taxid_number and a geo_location out of response_meta (final review MF-3)', async () => {
    const { responseMeta } = await recordedFor('investorProfile.create', '/v2/investor_profiles', {
      id: 'inv_1',
      object: 'investor_profile',
      status: 'pending',
      first_tax_residency: { country: 'IN', taxid_number: 'AAAPA3751A' },
      geo_location: { latitude: 19.07, longitude: 72.87 },
    });
    const text = JSON.stringify(responseMeta);
    for (const value of ['AAAPA3751A', '19.07', '72.87']) expect(text).not.toContain(value);
    expect(responseMeta).toMatchObject({ id: 'inv_1', status: 'pending' });
  });

  it('keeps error.status and error.code readable in response_meta of a rejection (final review MF-3)', async () => {
    const agent = agentWithToken();
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/mf_purchases', method: 'POST' })
      .reply(400, { error: { status: 400, code: 'INVALID_SCHEME', message: 'bad 9876543210' } });
    const { record, entries } = recorder();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      record,
    );
    await transport
      .call('purchase.create', { body: { source_ref_id: 'o-1' }, consent: consent() })
      .catch(() => undefined);
    const { responseMeta } = entries[0] as { responseMeta: unknown };
    expect(responseMeta).toEqual({
      error: { status: '400', code: 'INVALID_SCHEME', message: '[REDACTED]' },
    });
  });
});
