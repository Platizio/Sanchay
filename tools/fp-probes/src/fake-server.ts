import { MockAgent } from 'undici';

export interface FakeServerUrls {
  readonly fp: string;
  readonly poa: string;
  readonly pg: string;
}

/**
 * A small, independent fake FP/POA/PG responder for `--env=fake` (see D4's Interfaces deviation
 * note for why this does not reuse `apps/api`'s `FakeFp`). It covers only the operations this
 * harness's four chains call today.
 */
export function createFakeServer(urls: FakeServerUrls): MockAgent {
  const agent = new MockAgent();
  agent.disableNetConnect();
  let sequence = 0;
  const nextId = (prefix: string): string => {
    sequence += 1;
    return `${prefix}${sequence}`;
  };
  const purchases = new Map<string, Record<string, unknown>>();

  for (const base of [urls.fp, urls.poa, urls.pg]) {
    agent
      .get(base)
      .intercept({ path: (p) => p.startsWith('/v2/auth/'), method: 'POST' })
      .reply(200, { access_token: 'fake-token', expires_in: 1800 })
      .persist();
  }

  agent
    .get(urls.poa)
    .intercept({ path: '/poa/pre_verifications', method: 'POST' })
    .reply(200, () => ({
      object: 'pre_verification',
      id: nextId('pv_'),
      status: 'completed',
      readiness: { status: 'verified' },
    }))
    .persist();

  agent
    .get(urls.poa)
    .intercept({ path: (p) => p.startsWith('/poa/pre_verifications/'), method: 'GET' })
    .reply(200, (opts) => ({
      object: 'pre_verification',
      id: opts.path.split('/').pop(),
      status: 'completed',
      readiness: { status: 'verified' },
    }))
    .persist();

  agent
    .get(urls.fp)
    .intercept({
      // RV-02-15: FP answers 400 parameter_missing without `expand`, so the stub only matches when it is sent.
      path: (p) =>
        p.startsWith('/v2/mf_scheme_plans/cybrillapoa?') &&
        new URLSearchParams(p.slice(p.indexOf('?') + 1)).get('expand') === 'mf_scheme,mf_fund',
      method: 'GET',
    })
    .reply(200, {
      object: 'list',
      data: [
        {
          isin: 'INF209K01157',
          type: 'regular',
          option: 'growth',
          active: true,
          mf_scheme: { name: 'Fake Liquid Fund' },
          mf_fund: { name: 'Fake AMC' },
        },
      ],
    })
    .persist();

  agent
    .get(urls.fp)
    .intercept({ path: '/v2/mf_purchases', method: 'POST' })
    .reply(200, (opts) => {
      const body = JSON.parse(String(opts.body ?? '{}')) as Record<string, unknown>;
      const id = nextId('mfp_');
      sequence += 1;
      const record = { id, old_id: 1000 + sequence, state: 'under_review', ...body };
      purchases.set(id, record);
      return record;
    })
    .persist();

  agent
    .get(urls.fp)
    .intercept({ path: (p) => p.startsWith('/v2/mf_purchases/'), method: 'GET' })
    .reply(
      200,
      (opts) => purchases.get(opts.path.split('/').pop() ?? '') ?? { error: { code: 'NOT_FOUND' } },
    )
    .persist();

  agent
    .get(urls.fp)
    .intercept({ path: '/v2/mf_purchases', method: 'PATCH' })
    .reply(200, (opts) => {
      const body = JSON.parse(String(opts.body ?? '{}')) as Record<string, unknown>;
      const existing = purchases.get(String(body.id));
      const updated = {
        ...(existing ?? {}),
        ...body,
        state:
          body.state === 'confirmed' ? 'submitted' : ((existing?.state as string) ?? 'pending'),
      };
      purchases.set(String(body.id), updated);
      return updated;
    })
    .persist();

  agent
    .get(urls.pg)
    .intercept({ path: '/api/pg/mandates', method: 'POST' })
    .reply(200, () => {
      sequence += 1;
      return { id: 2000 + sequence, mandate_ref: `mref_${sequence}`, mandate_status: 'CREATED' };
    })
    .persist();

  return agent;
}
