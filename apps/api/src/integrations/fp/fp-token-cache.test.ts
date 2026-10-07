import { MockAgent } from 'undici';
import { describe, expect, it } from 'vitest';
import { FpTokenCache } from './fp-token-cache.js';

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

function agentWithTokenCounter(): { agent: MockAgent; calls: () => number } {
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
  agent
    .get('https://poa.fake.local')
    .intercept({ path: '/v2/auth/cybrillarta/token', method: 'POST' })
    .reply(200, { access_token: 'poa-tok', expires_in: 1800 })
    .persist();
  return { agent, calls: () => calls };
}

describe('FpTokenCache', () => {
  it('fetches once per audience and reuses the cached token', async () => {
    const { agent, calls } = agentWithTokenCounter();
    const cache = new FpTokenCache(BASE_URLS, CREDENTIALS, agent);
    expect(await cache.tokenFor('fp')).toBe('tok-1');
    expect(await cache.tokenFor('fp')).toBe('tok-1');
    expect(calls()).toBe(1);
  });

  it('caches fp and poa independently', async () => {
    const { agent } = agentWithTokenCounter();
    const cache = new FpTokenCache(BASE_URLS, CREDENTIALS, agent);
    expect(await cache.tokenFor('fp')).toBe('tok-1');
    expect(await cache.tokenFor('poa')).toBe('poa-tok');
  });

  it('de-duplicates concurrent refreshes into one in-flight request', async () => {
    const { agent, calls } = agentWithTokenCounter();
    const cache = new FpTokenCache(BASE_URLS, CREDENTIALS, agent);
    const [a, b, c] = await Promise.all([
      cache.tokenFor('fp'),
      cache.tokenFor('fp'),
      cache.tokenFor('fp'),
    ]);
    expect([a, b, c]).toEqual(['tok-1', 'tok-1', 'tok-1']);
    expect(calls()).toBe(1);
  });

  it('refreshes once the cached token is within 60s of expiry', async () => {
    const agent = new MockAgent();
    agent.disableNetConnect();
    let now = 0;
    let calls = 0;
    agent
      .get('https://fp.fake.local')
      .intercept({ path: '/v2/auth/sanchay/token', method: 'POST' })
      .reply(() => {
        calls += 1;
        return { statusCode: 200, data: { access_token: `tok-${calls}`, expires_in: 120 } };
      })
      .persist();
    const cache = new FpTokenCache(BASE_URLS, CREDENTIALS, agent, () => now);
    expect(await cache.tokenFor('fp')).toBe('tok-1');
    now = 61_001; // 120s life - 60s refresh buffer = usable until 60s; one ms past that must refetch
    expect(await cache.tokenFor('fp')).toBe('tok-2');
    expect(calls).toBe(2);
  });
});
