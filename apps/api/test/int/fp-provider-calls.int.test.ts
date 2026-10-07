import { eq } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import type { MockAgent } from 'undici';
import { describe, expect, it } from 'vitest';
import { runInTx } from '../../src/db/client.js';
import { ProviderCallInTransactionError } from '../../src/integrations/fp/fp-errors.js';
import { FP_DISPATCHER, FpTransport } from '../../src/integrations/fp/fp-transport.js';
import { providerCalls } from '../../src/integrations/fp/provider-calls.schema.js';
import { Crypto } from '../../src/modules/platform/crypto.js';
import { asRowId } from '../../src/modules/platform/ids.js';
import type { SanchayClsStore } from '../../src/modules/platform/request-context.js';
import { bootTestApp } from './app.js';

describe('provider_calls (worker role)', () => {
  it('api role cannot resolve FpTransport', async () => {
    const t = await bootTestApp();
    try {
      expect(() => t.app.get(FpTransport)).toThrow();
    } finally {
      await t.close();
    }
  });

  it('worker role resolves FpTransport, records a call, and redacts PII from the stored meta', async () => {
    const t = await bootTestApp({
      env: { SANCHAY_APP_ROLE: 'worker', SANCHAY_PROVIDER_MODE_FP: 'fake' },
    });
    try {
      const dispatcher = t.app.get<MockAgent>(FP_DISPATCHER);
      dispatcher
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/auth/sanchay/token', method: 'POST' })
        .reply(200, { access_token: 'tok', expires_in: 1800 })
        .persist();
      dispatcher
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/mf_scheme_plans/cybrillapoa', method: 'GET' })
        .reply(200, { object: 'list', data: [], pan: 'AAAPA3751A', mobile: '9876543210' })
        .persist();
      const transport = t.app.get(FpTransport);
      await transport.call('schemePlans.list', {});
      const [row] = await t.db.db
        .select()
        .from(providerCalls)
        .where(eq(providerCalls.operation, 'schemePlans.list'));
      if (row === undefined) throw new Error('no provider_calls row for schemePlans.list');
      expect(JSON.stringify(row.responseMeta)).not.toMatch(/9876543210|AAAPA3751A/);
    } finally {
      await t.close();
    }
  });

  it('body_enc decrypts only under its own row AAD', async () => {
    const t = await bootTestApp({
      env: { SANCHAY_APP_ROLE: 'worker', SANCHAY_PROVIDER_MODE_FP: 'fake' },
    });
    try {
      const dispatcher = t.app.get<MockAgent>(FP_DISPATCHER);
      dispatcher
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/auth/sanchay/token', method: 'POST' })
        .reply(200, { access_token: 'tok', expires_in: 1800 })
        .persist();
      dispatcher
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/mf_scheme_plans/cybrillapoa', method: 'GET' })
        .reply(200, { object: 'list', data: [] })
        .persist();
      const transport = t.app.get(FpTransport);
      await transport.call('schemePlans.list', {});
      const [row] = await t.db.db
        .select()
        .from(providerCalls)
        .where(eq(providerCalls.operation, 'schemePlans.list'));
      if (row === undefined) throw new Error('no provider_calls row for schemePlans.list');
      const crypto = t.app.get(Crypto);
      const rowId = asRowId('provider_calls', row.id);
      expect(() =>
        crypto.decrypt(row.bodyEnc, { table: 'provider_calls', column: 'body_enc', rowId }),
      ).not.toThrow();
      expect(() =>
        crypto.decrypt(row.bodyEnc, {
          table: 'provider_calls',
          column: 'body_enc',
          rowId: 'not-the-row-id' as never,
        }),
      ).toThrow();
    } finally {
      await t.close();
    }
  });

  it('runInTx (also outside a request context) makes FpTransport.call refuse to run inside the transaction', async () => {
    const t = await bootTestApp({
      env: { SANCHAY_APP_ROLE: 'worker', SANCHAY_PROVIDER_MODE_FP: 'fake' },
    });
    try {
      const dispatcher = t.app.get<MockAgent>(FP_DISPATCHER);
      dispatcher
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/auth/sanchay/token', method: 'POST' })
        .reply(200, { access_token: 'tok', expires_in: 1800 })
        .persist();
      dispatcher
        .get('https://fp.fake.local')
        .intercept({ path: '/v2/mf_scheme_plans/cybrillapoa', method: 'GET' })
        .reply(200, { object: 'list', data: [] })
        .persist();
      const transport = t.app.get(FpTransport);
      const cls = t.app.get<ClsService<SanchayClsStore>>(ClsService);
      await expect(
        runInTx(t.db, cls, () => transport.call('schemePlans.list', {})),
      ).rejects.toBeInstanceOf(ProviderCallInTransactionError);
      // The flag does not leak: the same call succeeds once the transaction has ended.
      await expect(transport.call('schemePlans.list', {})).resolves.toMatchObject({ status: 200 });
    } finally {
      await t.close();
    }
  });

  it('is append-only for sanchay_app (UPDATE and DELETE are revoked, INSERT is not)', async () => {
    const t = await bootTestApp();
    try {
      const sqlStateAsApp = async (sqlText: string): Promise<string | undefined> => {
        const client = await t.db.pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SET LOCAL ROLE sanchay_app');
          await client.query(sqlText);
          return undefined;
        } catch (error) {
          return (error as { code?: string }).code;
        } finally {
          await client.query('ROLLBACK');
          client.release();
        }
      };
      expect(
        await sqlStateAsApp(
          "INSERT INTO app.provider_calls (provider, operation, duration_ms, body_enc) VALUES ('fp', 'schemePlans.list', 1, decode('00', 'hex'))",
        ),
      ).toBeUndefined();
      expect(await sqlStateAsApp("UPDATE app.provider_calls SET error_code = 'X'")).toBe('42501');
      expect(await sqlStateAsApp('DELETE FROM app.provider_calls')).toBe('42501');
    } finally {
      await t.close();
    }
  });
});
