import { Logger } from '@nestjs/common';
import type { ClsService } from 'nestjs-cls';
import { type Dispatcher, MockAgent } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SanchayClsStore } from '../../modules/platform/request-context.js';
import type { ConsumedConsent } from './consumed-consent.js';
import {
  ConsentNotConsumedError,
  FpAmbiguousError,
  FpRejectedError,
  FpUnavailableError,
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

  it.each([
    [429, 'RATE_LIMITED'],
    [408, 'TIMEOUT_408'],
  ])(
    'maps a %i to FpAmbiguousError (retryable), not a terminal rejection, recorded as %s (final review MF-6)',
    async (status, errorCode) => {
      const agent = agentWithToken();
      agent
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/mf_purchases', method: 'POST' })
        .reply(status, { error: { status, code: 'THROTTLED', message: 'slow down' } });
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
      expect((failure as FpAmbiguousError).httpStatus).toBe(status);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ httpStatus: status, errorCode });
    },
  );

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

  it('keeps plain number leaves of a request body out of request_meta (RV-02-84: geo_location)', async () => {
    const agent = agentWithToken();
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/investor_profiles', method: 'POST' })
      .reply(200, { id: 'invp_1', object: 'investor_profile' });
    const { record, entries } = recorder();
    const transport = new FpTransport(
      BASE_URLS,
      new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
      agent,
      clsWith(false),
      record,
    );
    await transport.call('investorProfile.create', {
      body: {
        type: 'individual',
        geo_location: { latitude: 12.971599, longitude: 77.594566 },
        retries: 3,
        verified: true,
      },
      consent: consent(),
    });
    const { requestMeta } = entries[0] as { requestMeta: { body: unknown } };
    const stored = JSON.stringify(requestMeta);
    expect(stored).not.toContain('12.971599');
    expect(stored).not.toContain('77.594566');
    expect(requestMeta.body).toMatchObject({
      geo_location: { latitude: '[REDACTED]', longitude: '[REDACTED]' },
      retries: '[REDACTED]',
      verified: true,
    });
  });

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

  describe('R-47 transport fixes (owner ruling 2026-10-09)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    /** An agent whose fp token endpoint hands out `tok-1`, `tok-2`, ... and counts the fetches. */
    function agentWithFreshTokens(): { agent: MockAgent; tokenCalls: () => number } {
      const agent = new MockAgent();
      agent.disableNetConnect();
      let calls = 0;
      agent
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/auth/sanchay/token', method: 'POST' })
        .reply(() => {
          calls += 1;
          return { statusCode: 200, data: { access_token: `tok-${calls}`, expires_in: 1800 } };
        })
        .persist();
      return { agent, tokenCalls: () => calls };
    }

    function transportOn(agent: MockAgent, record = recorder().record): FpTransport {
      return new FpTransport(
        BASE_URLS,
        new FpTokenCache(BASE_URLS, CREDENTIALS, agent),
        agent,
        clsWith(false),
        record,
      );
    }

    const purchase = (transport: FpTransport) =>
      transport
        .call('purchase.create', { body: { source_ref_id: 'o-1' }, consent: consent() })
        .catch((error: unknown) => error);

    it.each([
      ['a token endpoint 500', 500, JSON.stringify({ error: 'down' })],
      ['a token reply with no access_token', 200, JSON.stringify({ expires_in: 1800 })],
      ['a token reply that is not JSON', 200, '<html>login</html>'],
    ])(
      '(1) %s records one TOKEN_ERROR row and throws FpUnavailableError, never sending "Bearer undefined"',
      async (_label, statusCode, data) => {
        const agent = new MockAgent();
        agent.disableNetConnect();
        agent
          .get('https://fp.fake.local')
          .intercept({ path: '/v2/auth/sanchay/token', method: 'POST' })
          .reply(statusCode, data);
        const purchases = vi.fn(() => ({ statusCode: 201, data: { id: 'mfp_1' } }));
        agent
          .get('https://fp.fake.local')
          .intercept({ path: '/v2/mf_purchases', method: 'POST' })
          .reply(purchases)
          .persist();
        const { record, entries } = recorder();
        const failure = await purchase(transportOn(agent, record));
        expect(failure).toBeInstanceOf(FpUnavailableError);
        expect(failure).toBeInstanceOf(FpAmbiguousError);
        expect(failure).not.toBeInstanceOf(FpRejectedError);
        expect((failure as FpUnavailableError).reason).toBe('TOKEN');
        expect(purchases).not.toHaveBeenCalled();
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
          operation: 'purchase.create',
          errorCode: 'TOKEN_ERROR',
          httpStatus: null,
        });
      },
    );

    it.each([401, 403])(
      '(2) a %i evicts the token and retries once with a fresh one',
      async (status) => {
        const { agent, tokenCalls } = agentWithFreshTokens();
        const pool = agent.get('https://fp.fake.local');
        pool
          .intercept({
            path: '/v2/mf_purchases',
            method: 'POST',
            headers: { authorization: 'Bearer tok-1' },
          })
          .reply(status, { error: { status, code: 'UNAUTHORIZED', message: 'token revoked' } });
        pool
          .intercept({
            path: '/v2/mf_purchases',
            method: 'POST',
            headers: { authorization: 'Bearer tok-2' },
          })
          .reply(201, { id: 'mfp_1', object: 'mf_purchase', state: 'pending' });
        const { record, entries } = recorder();
        const result = await purchase(transportOn(agent, record));
        expect(result).toMatchObject({ status: 201, body: { id: 'mfp_1' } });
        expect(tokenCalls()).toBe(2);
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ httpStatus: status, errorCode: 'AUTH_REJECTED' });
        expect(entries[1]).toMatchObject({ httpStatus: 201, errorCode: null });
      },
    );

    it.each([401, 403])(
      '(2) a second %i throws FpUnavailableError (retryable), never FpRejectedError',
      async (status) => {
        const { agent, tokenCalls } = agentWithFreshTokens();
        agent
          .get('https://fp.fake.local')
          .intercept({ path: '/v2/mf_purchases', method: 'POST' })
          .reply(status, { error: { status, code: 'FORBIDDEN', message: 'no' } })
          .times(2);
        const { record, entries } = recorder();
        const failure = await purchase(transportOn(agent, record));
        expect(failure).toBeInstanceOf(FpUnavailableError);
        expect(failure).not.toBeInstanceOf(FpRejectedError);
        expect((failure as FpUnavailableError).reason).toBe('AUTH');
        expect((failure as FpUnavailableError).httpStatus).toBe(status);
        expect(tokenCalls()).toBe(2);
        expect(entries).toHaveLength(2);
        for (const entry of entries) {
          expect(entry).toMatchObject({ httpStatus: status, errorCode: 'AUTH_REJECTED' });
        }
      },
    );

    it.each([
      ['a body that is not JSON', '<html>ok</html>'],
      ['an empty body', ''],
    ])('(3) a 2xx write with %s is ambiguous (UNPARSABLE_2XX)', async (_label, data) => {
      const { agent } = agentWithFreshTokens();
      agent
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/mf_purchases', method: 'POST' })
        .reply(201, data);
      const { record, entries } = recorder();
      const failure = await purchase(transportOn(agent, record));
      expect(failure).toBeInstanceOf(FpAmbiguousError);
      expect(failure).not.toBeInstanceOf(FpUnavailableError);
      expect((failure as FpAmbiguousError).httpStatus).toBe(201);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ httpStatus: 201, errorCode: 'UNPARSABLE_2XX' });
    });

    it('(3) a 2xx read with an empty body still resolves: reads have no side effect to lose', async () => {
      const { agent } = agentWithFreshTokens();
      agent
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/mf_scheme_plans/cybrillapoa/INF209KA1K47', method: 'GET' })
        .reply(200, '');
      const result = await transportOn(agent).call('schemePlans.get', {
        pathParams: { isin: 'INF209KA1K47' },
      });
      expect(result).toEqual({ status: 200, body: undefined });
    });

    it("(4) a failed provider-calls write is logged and never replaces FP's success", async () => {
      const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { agent } = agentWithFreshTokens();
      agent
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/mf_purchases', method: 'POST' })
        .reply(201, { id: 'mfp_1', object: 'mf_purchase' });
      const failingRecord = vi.fn(async () => {
        throw new Error('connection terminated');
      });
      const result = await purchase(transportOn(agent, failingRecord));
      expect(result).toMatchObject({ status: 201, body: { id: 'mfp_1' } });
      expect(failingRecord).toHaveBeenCalledTimes(1);
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(String(errorLog.mock.calls[0]?.[0])).toContain('purchase.create');
    });

    it("(4) a failed provider-calls write never replaces FP's rejection or ambiguity", async () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const failingRecord = vi.fn(async () => {
        throw new Error('connection terminated');
      });
      const rejected = agentWithFreshTokens().agent;
      rejected
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/mf_purchases', method: 'POST' })
        .reply(400, { error: { status: 400, code: 'INVALID_SCHEME', message: 'unknown' } });
      expect(await purchase(transportOn(rejected, failingRecord))).toBeInstanceOf(FpRejectedError);
      const timedOut = agentWithFreshTokens().agent;
      timedOut
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/mf_purchases', method: 'POST' })
        .replyWithError(new Error('simulated timeout'));
      expect(await purchase(transportOn(timedOut, failingRecord))).toBeInstanceOf(FpAmbiguousError);
    });

    it('(5) a 3xx is ambiguous on a write and an error on a read (UNEXPECTED_3XX), never followed', async () => {
      const { agent } = agentWithFreshTokens();
      const pool = agent.get('https://fp.fake.local');
      pool
        .intercept({ path: '/v2/mf_purchases', method: 'POST' })
        .reply(302, '', { headers: { location: 'https://fp.fake.local/login' } });
      pool
        .intercept({ path: '/v2/mf_scheme_plans/cybrillapoa/INF209KA1K47', method: 'GET' })
        .reply(301, '', { headers: { location: 'https://fp.fake.local/moved' } });
      const { record, entries } = recorder();
      const transport = transportOn(agent, record);
      const write = await purchase(transport);
      expect(write).toBeInstanceOf(FpAmbiguousError);
      expect((write as FpAmbiguousError).httpStatus).toBe(302);
      const read = await transport
        .call('schemePlans.get', { pathParams: { isin: 'INF209KA1K47' } })
        .catch((error: unknown) => error);
      expect(read).toBeInstanceOf(FpAmbiguousError);
      expect((read as FpAmbiguousError).httpStatus).toBe(301);
      expect(entries).toEqual([
        expect.objectContaining({ httpStatus: 302, errorCode: 'UNEXPECTED_3XX' }),
        expect.objectContaining({ httpStatus: 301, errorCode: 'UNEXPECTED_3XX' }),
      ]);
    });
  });
});
