import { Agent, type Dispatcher, request } from 'undici';
import { createFakeServer, type FakeServerUrls } from './fake-server.js';
import type { ChainContext, FpProbeClient, RunOptions } from './types.js';

interface AudienceCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
}

interface Credentials {
  readonly tenantId: string;
  readonly fp: AudienceCredentials;
  readonly poa: AudienceCredentials;
  readonly pg: AudienceCredentials;
}

const FAKE_URLS: FakeServerUrls = {
  fp: 'https://fp.fake.local',
  poa: 'https://poa.fake.local',
  pg: 'https://pg.fake.local',
};
const FAKE_CREDENTIALS: Credentials = {
  tenantId: 'sanchay',
  fp: { clientId: 'fake', clientSecret: 'fake' },
  poa: { clientId: 'fake', clientSecret: 'fake' },
  pg: { clientId: 'fake', clientSecret: 'fake' },
};

function sandboxUrls(): FakeServerUrls {
  const base = process.env.SANCHAY_FP_BASE_URL;
  if (base === undefined) throw new Error('SANCHAY_FP_BASE_URL is required for --env=sandbox');
  return { fp: base, poa: base, pg: base };
}

function sandboxCredentials(): Credentials {
  const raw = process.env.SANCHAY_FP_CREDENTIALS_JSON;
  if (raw === undefined)
    throw new Error('SANCHAY_FP_CREDENTIALS_JSON is required for --env=sandbox');
  return JSON.parse(raw) as Credentials;
}

async function fetchToken(
  dispatcher: Dispatcher,
  base: string,
  path: string,
  credentials: AudienceCredentials,
): Promise<string> {
  const response = await request(`${base}${path}`, {
    method: 'POST',
    dispatcher,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: 'client_credentials',
    }).toString(),
  });
  const body = JSON.parse(await response.body.text()) as { access_token: string };
  return body.access_token;
}

export async function buildClient(options: RunOptions): Promise<ChainContext> {
  const urls = options.env === 'fake' ? FAKE_URLS : sandboxUrls();
  const credentials = options.env === 'fake' ? FAKE_CREDENTIALS : sandboxCredentials();
  const dispatcher: Dispatcher =
    options.env === 'fake'
      ? createFakeServer(urls)
      : new Agent({ connectTimeout: 10_000, bodyTimeout: 30_000, headersTimeout: 30_000 });

  const fpToken = await fetchToken(
    dispatcher,
    urls.fp,
    `/v2/auth/${credentials.tenantId}/token`,
    credentials.fp,
  );
  const poaToken = await fetchToken(
    dispatcher,
    urls.poa,
    '/v2/auth/cybrillarta/token',
    credentials.poa,
  );
  const pgToken =
    options.env === 'fake'
      ? fpToken
      : await fetchToken(
          dispatcher,
          urls.pg,
          `/v2/auth/${credentials.tenantId}/token`,
          credentials.pg,
        );

  async function call(
    base: string,
    token: string,
    path: string,
    method: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> {
    const response = await request(`${base}${path}`, {
      method,
      dispatcher,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-tenant-id': credentials.tenantId,
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
    const text = await response.body.text();
    return text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {};
  }

  const client: FpProbeClient = {
    preVerify: (input) =>
      call(urls.poa, poaToken, '/poa/pre_verifications', 'POST', {
        investor_identifier: input.pan,
        pan: { value: input.pan },
        name: { value: input.name },
        date_of_birth: { value: input.dateOfBirth },
      }),
    getPreVerification: (id) => call(urls.poa, poaToken, `/poa/pre_verifications/${id}`, 'GET'),
    schemePlans: async () => {
      const result = await call(
        urls.fp,
        fpToken,
        '/v2/mf_scheme_plans/cybrillapoa?expand=mf_scheme,mf_fund&page=0&size=100',
        'GET',
      );
      return Array.isArray(result.data) ? (result.data as Array<Record<string, unknown>>) : [];
    },
    createPurchase: (input) => call(urls.fp, fpToken, '/v2/mf_purchases', 'POST', input),
    getPurchase: (id) => call(urls.fp, fpToken, `/v2/mf_purchases/${id}`, 'GET'),
    updatePurchase: (input) => call(urls.fp, fpToken, '/v2/mf_purchases', 'PATCH', input),
    createMandate: (input) => call(urls.pg, pgToken, '/api/pg/mandates', 'POST', input),
  };
  return { client };
}
