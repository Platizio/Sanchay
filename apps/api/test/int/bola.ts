import { randomUUID } from 'node:crypto';
import { contract } from '@sanchay/contract';
import { expect } from 'vitest';
import type { TestApp } from './app.js';
import { signInWeb } from './flows.js';
import { webHeaders } from './http.js';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function routeOf(procedureKey: string): { method: HttpMethod; path: string } {
  let node: unknown = contract;
  for (const part of procedureKey.split('.')) {
    node = (node as Record<string, unknown> | undefined)?.[part];
  }
  const route = (
    node as { '~orpc'?: { route?: { method?: HttpMethod; path?: string } } } | undefined
  )?.['~orpc']?.route;
  if (route?.method === undefined || route.path === undefined) {
    throw new Error(`expectBola: ${procedureKey} has no HTTP route`);
  }
  return { method: route.method, path: route.path };
}

/**
 * BOLA (outline §0.1): a different, freshly signed-in investor calling `procedureKey` with ids that
 * belong to someone else gets 404, never a 403/409/200 that would confirm the id exists. Path params
 * are filled from `foreignIdArgs`; the rest go in the query (GET) or the JSON body.
 */
export async function expectBola(
  app: TestApp,
  procedureKey: string,
  foreignIdArgs: Record<string, string>,
): Promise<void> {
  const { method, path } = routeOf(procedureKey);
  const rest: Record<string, string> = { ...foreignIdArgs };
  const filled = path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = rest[name];
    if (value === undefined) {
      throw new Error(`expectBola: missing path param ${name} for ${procedureKey}`);
    }
    delete rest[name];
    return encodeURIComponent(value);
  });
  const query =
    method === 'GET' && Object.keys(rest).length > 0 ? `?${new URLSearchParams(rest)}` : '';
  const other = await signInWeb(
    app,
    `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
  );
  const res = await app.app.inject({
    method,
    url: `/api/v1${filled}${query}`,
    headers: { ...webHeaders({ cookies: other.cookies }), 'idempotency-key': randomUUID() },
    ...(method === 'GET' ? {} : { payload: rest }),
  });
  expect(res.statusCode, `BOLA: ${procedureKey} with a foreign id must 404`).toBe(404);
}
