import { type DynamicModule, Module } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Agent, MockAgent } from 'undici';
import { type Env, EnvError, parseFpCredentialsJson } from '../../config/env.js';
import { DB, type DbHandle } from '../../db/client.js';
import { Crypto } from '../../modules/platform/crypto.js';
import { newId } from '../../modules/platform/ids.js';
import type { SanchayClsStore } from '../../modules/platform/request-context.js';
import { FpKyc } from './fp-kyc.js';
import { FpProvision } from './fp-provision.js';
import { FpRead } from './fp-read.js';
import { type FpBaseUrls, type FpCredentials, FpTokenCache } from './fp-token-cache.js';
import { FpTransact } from './fp-transact.js';
import { FP_DISPATCHER, FpTransport, type ProviderCallRecordInput } from './fp-transport.js';
import { providerCalls } from './provider-calls.schema.js';

const CONNECT_TIMEOUT_MS = 10_000;
const BODY_TIMEOUT_MS = 30_000;

const FAKE_BASE_URLS: FpBaseUrls = {
  fp: 'https://fp.fake.local',
  poa: 'https://poa.fake.local',
  pg: 'https://pg.fake.local',
};
const FAKE_CREDENTIALS: FpCredentials = {
  tenantId: 'sanchay',
  fp: { clientId: 'fake', clientSecret: 'fake' },
  poa: { clientId: 'fake', clientSecret: 'fake' },
  pg: { clientId: 'fake', clientSecret: 'fake' },
};

function liveBaseUrls(env: Env): FpBaseUrls {
  if (env.SANCHAY_FP_BASE_URL === undefined) {
    throw new EnvError('SANCHAY_FP_BASE_URL is required outside fake mode');
  }
  return { fp: env.SANCHAY_FP_BASE_URL, poa: env.SANCHAY_FP_BASE_URL, pg: env.SANCHAY_FP_BASE_URL };
}

function recordProviderCall(dbh: DbHandle, crypto: Crypto) {
  return async (input: ProviderCallRecordInput): Promise<void> => {
    const id = newId('provider_calls');
    const bodyEnc = crypto.encrypt(input.rawForBodyEnc, {
      table: 'provider_calls',
      column: 'body_enc',
      rowId: id,
    });
    await dbh.db.insert(providerCalls).values({
      id,
      provider: input.audience,
      operation: input.operation,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      httpStatus: input.httpStatus,
      durationMs: input.durationMs,
      errorCode: input.errorCode,
      requestMeta: input.requestMeta as Record<string, unknown> | null,
      responseMeta: input.responseMeta as Record<string, unknown> | null,
      bodyEnc,
    });
  };
}

/**
 * Imported only when SANCHAY_APP_ROLE === 'worker' (app.module.ts). Global, so worker-only job
 * handlers in other modules (D10 CatalogueFpSyncJob, E-tasks) can inject FpRead and friends. In
 * 'fake' mode D3 uses a bare undici MockAgent with net connect disabled; D4 swaps in FakeFp.
 */
@Module({})
export class FpModule {
  static forRoot(env: Env): DynamicModule {
    const isFake = env.SANCHAY_PROVIDER_MODE_FP === 'fake';
    const baseUrls = isFake ? FAKE_BASE_URLS : liveBaseUrls(env);
    const credentials: FpCredentials = isFake
      ? FAKE_CREDENTIALS
      : parseFpCredentialsJson(env.SANCHAY_FP_CREDENTIALS_JSON);

    return {
      module: FpModule,
      global: true,
      providers: [
        {
          provide: FP_DISPATCHER,
          useFactory: () => {
            if (!isFake) {
              return new Agent({
                connectTimeout: CONNECT_TIMEOUT_MS,
                bodyTimeout: BODY_TIMEOUT_MS,
                headersTimeout: BODY_TIMEOUT_MS,
              });
            }
            const agent = new MockAgent();
            agent.disableNetConnect();
            return agent;
          },
        },
        {
          provide: FpTokenCache,
          inject: [FP_DISPATCHER],
          useFactory: (dispatcher: Agent | MockAgent) =>
            new FpTokenCache(baseUrls, credentials, dispatcher),
        },
        {
          provide: FpTransport,
          inject: [FP_DISPATCHER, FpTokenCache, ClsService, DB, Crypto],
          useFactory: (
            dispatcher: Agent | MockAgent,
            tokens: FpTokenCache,
            cls: ClsService<SanchayClsStore>,
            dbh: DbHandle,
            crypto: Crypto,
          ) => new FpTransport(baseUrls, tokens, dispatcher, cls, recordProviderCall(dbh, crypto)),
        },
        { provide: FpRead, inject: [FpTransport], useFactory: (t: FpTransport) => new FpRead(t) },
        { provide: FpKyc, inject: [FpTransport], useFactory: (t: FpTransport) => new FpKyc(t) },
        {
          provide: FpProvision,
          inject: [FpTransport],
          useFactory: (t: FpTransport) => new FpProvision(t),
        },
        {
          provide: FpTransact,
          inject: [FpTransport],
          useFactory: (t: FpTransport) => new FpTransact(t),
        },
      ],
      exports: [FpTransport, FpRead, FpKyc, FpProvision, FpTransact, FP_DISPATCHER],
    };
  }
}
