import { randomUUID } from 'node:crypto';
import { Reflector } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthRouter } from '../../src/modules/platform/health.router.js';
import { INFRA_ROUTE } from '../../src/modules/platform/http-decorators.js';
import { bootTestApp, type TestApp } from './app.js';
import { nativeHeaders, webHeaders } from './http.js';
import { InfraRoutesTestController, InfraRoutesTestModule } from './infra-routes.js';

let t: TestApp;

beforeAll(async () => {
  t = await bootTestApp({ testModules: [InfraRoutesTestModule] });
});

afterAll(async () => {
  await t.close();
});

const REF = 'r7Qx2mV9pL4sN8wK1cZ5bA';
const INFRA_ROUTES: Array<[string, 'GET' | 'POST', string]> = [
  ['GET /api/v1/health', 'GET', '/api/v1/health'],
  ['GET /api/v1/pg/return/:ref', 'GET', `/api/v1/pg/return/${REF}`],
  ['POST /api/v1/pg/return/:ref', 'POST', `/api/v1/pg/return/${REF}`],
];

describe('R-11 guard exemptions (restricted only by HostGuard, which arrives with E2)', () => {
  it.each(INFRA_ROUTES)(
    '%s skips ClientGuard and SessionGuard: no client header, no session, 200',
    async (_name, method, url) => {
      const res = await t.app.inject({ method, url });
      expect(res.statusCode).toBe(200);
    },
  );

  it.each(INFRA_ROUTES)(
    '%s ignores a client value ClientGuard rejects (ios) and an unknown bearer',
    async (_name, method, url) => {
      const res = await t.app.inject({
        method,
        url,
        headers: nativeHeaders({
          installationId: randomUUID(),
          platform: 'ios',
          token: 'x'.repeat(43),
        }),
      });
      expect(res.statusCode).toBe(200);
    },
  );

  it('keeps both guards on every other route (control)', async () => {
    const bare = await t.app.inject({ method: 'GET', url: '/api/v1/auth/session' });
    expect([bare.statusCode, bare.json().code]).toEqual([403, 'ORIGIN_REJECTED']);
    const anonymous = await t.app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: webHeaders(),
    });
    expect([anonymous.statusCode, anonymous.json().code]).toEqual([401, 'AUTH_REQUIRED']);
  });

  it('records the HostGuard scope: pg/return on the api host only, health on both hosts', () => {
    const reflector = new Reflector();
    expect(reflector.get(INFRA_ROUTE, HealthRouter)).toBe('APP_AND_API_HOSTS');
    const proto = InfraRoutesTestController.prototype;
    for (const handler of [proto.pgReturnGet, proto.pgReturnPost]) {
      expect(reflector.get(INFRA_ROUTE, handler)).toBe('API_HOST');
    }
  });
});
