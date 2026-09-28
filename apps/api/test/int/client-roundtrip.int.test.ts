import { randomUUID } from 'node:crypto';
import { createORPCClient, isDefinedError, safe } from '@orpc/client';
import type { ContractRouterClient } from '@orpc/contract';
import type { JsonifiedClient } from '@orpc/openapi-client';
import { OpenAPILink } from '@orpc/openapi-client/fetch';
import { contract } from '@sanchay/contract';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, type TestApp } from './app.js';

type Client = JsonifiedClient<ContractRouterClient<typeof contract>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let t: TestApp;
let baseUrl = '';
beforeAll(async () => {
  t = await bootTestApp();
  await t.app.listen(0, '127.0.0.1');
  baseUrl = `${await t.app.getUrl()}/api/v1`;
});
afterAll(async () => {
  await t.close();
});

function clientFor(headers: Record<string, string>): Client {
  return createORPCClient(new OpenAPILink(contract, { url: baseUrl, headers }));
}

const androidHeaders = (): Record<string, string> => ({
  'x-sanchay-client': 'android',
  'x-installation-id': randomUUID(),
  'x-app-version': '1.0.0',
});

describe('OpenAPILink round-trip (design §D.1 S0 gate)', () => {
  it('surfaces OTP_INVALID as a typed, defined error and then signs in with a bearer', async () => {
    const mobile = '9866600001';
    const headers = androidHeaders();
    const client = clientFor(headers);
    const sent = await client.auth.requestOtp({ mobile });
    expect(sent.challengeId).toMatch(UUID_RE);
    expect([sent.expiresInSeconds, sent.resendAfterSeconds]).toEqual([300, 30]);
    const real = t.sms.latestCode(mobile);

    const { error, isDefined } = await safe(
      client.auth.verifyOtp({
        challengeId: sent.challengeId,
        code: real === '000000' ? '111111' : '000000',
      }),
    );
    expect(isDefined).toBe(true);
    if (!isDefinedError(error)) throw new Error('expected a defined oRPC error');
    expect(error.code).toBe('OTP_INVALID');
    expect(error.status).toBe(401);
    expect(error.data.retryable).toBe(false);
    expect(error.data.requestId).toMatch(/^[0-9a-f-]{36}$/);

    const ok = await client.auth.verifyOtp({ challengeId: sent.challengeId, code: real });
    if (ok.session.token === undefined) throw new Error('expected a native bearer session');
    const me = await clientFor({
      ...headers,
      authorization: `Bearer ${ok.session.token}`,
    }).auth.session();
    expect(me.platform).toBe('ANDROID');
    expect(me.investor.mobileMasked).toBe('••••••0001');
  });

  it('surfaces OTP_COOLDOWN as a defined 429 with retryAfterSeconds', async () => {
    const mobile = '9866600002';
    const client = clientFor(androidHeaders());
    await client.auth.requestOtp({ mobile });
    const { error, isDefined } = await safe(client.auth.requestOtp({ mobile }));
    expect(isDefined).toBe(true);
    if (!isDefinedError(error)) throw new Error('expected a defined oRPC error');
    expect(error.code).toBe('OTP_COOLDOWN');
    expect(error.status).toBe(429);
    expect(error.data.retryAfterSeconds).toBe(30);
    expect(error.data.retryable).toBe(true);
  });

  it('surfaces AUTH_REQUIRED as a defined 401 on an investor procedure', async () => {
    const { error, isDefined } = await safe(clientFor(androidHeaders()).auth.session());
    expect(isDefined).toBe(true);
    if (!isDefinedError(error)) throw new Error('expected a defined oRPC error');
    expect([error.code, error.status]).toEqual(['AUTH_REQUIRED', 401]);
  });
});
