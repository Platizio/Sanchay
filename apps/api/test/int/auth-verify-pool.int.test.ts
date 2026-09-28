import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditEvents } from '../../src/db/schema.js';
import { AUDIT_ACTIONS } from '../../src/modules/platform/audit.service.js';
import { bootTestApp, type TestApp } from './app.js';
import { nativeHeaders } from './http.js';

/** A deliberately tiny main pool, so SANCHAY_DB_POOL_MAX + 1 concurrent requests exhaust it. */
const POOL_MAX = 2;

let t: TestApp;
beforeAll(async () => {
  t = await bootTestApp({ env: { SANCHAY_DB_POOL_MAX: String(POOL_MAX) } });
});
afterAll(async () => {
  await t.close();
});

describe('POST /auth/otp/verify under main-pool pressure', () => {
  it('answers SANCHAY_DB_POOL_MAX + 1 concurrent wrong-code verifies with 401 OTP_INVALID and audits each, ' +
    'without waiting on a second main-pool connection (failure audit runs after the rollback)', async () => {
    const challengeIds = Array.from({ length: POOL_MAX + 1 }, () => randomUUID());
    const started = Date.now();
    const responses = await Promise.all(
      challengeIds.map((challengeId) =>
        t.app.inject({
          method: 'POST',
          url: '/api/v1/auth/otp/verify',
          headers: nativeHeaders({ installationId: randomUUID() }),
          payload: { challengeId, code: '123456' },
        }),
      ),
    );
    const elapsed = Date.now() - started;
    expect(responses.map((r) => [r.statusCode, r.json().code])).toEqual(
      challengeIds.map(() => [401, 'OTP_INVALID']),
    );
    // pg-pool's connectionTimeoutMillis is 5 s: a request that waited on the exhausted pool would take that long.
    expect(elapsed).toBeLessThan(4_000);
    const failed = await t.db.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, AUDIT_ACTIONS.AUTH_OTP_FAILED));
    expect(failed.map((r) => (r.data as { challengeId?: string }).challengeId).sort()).toEqual(
      [...challengeIds].sort(),
    );
  }, 20_000);
});
