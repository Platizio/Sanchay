import { randomUUID } from 'node:crypto';
import type { TestApp } from './app.js';
import { signInWeb } from './flows.js';
import { webHeaders } from './http.js';

export interface AuthedResponse {
  status: number;
  // biome-ignore lint/suspicious/noExplicitAny: tests assert response bodies structurally
  body: any;
}

export interface AuthedRequest {
  get(url: string): Promise<AuthedResponse>;
  post(url: string, payload?: unknown): Promise<AuthedResponse>;
  put(url: string, payload?: unknown): Promise<AuthedResponse>;
}

/** A signed-in investor through the real OTP flow of Plan 01; req sends the session cookies and a fresh idempotency key. */
export async function signedInInvestor(
  app: TestApp,
): Promise<{ investor: { id: string }; cookies: Record<string, string>; req: AuthedRequest }> {
  const mobile = `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  const { investorId, cookies } = await signInWeb(app, mobile);
  const send = async (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: unknown,
  ): Promise<AuthedResponse> => {
    const res = await app.app.inject({
      method,
      url,
      headers: { ...webHeaders({ cookies }), 'idempotency-key': randomUUID() },
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    });
    let body: unknown = null;
    try {
      body = res.json();
    } catch {
      body = res.body;
    }
    return { status: res.statusCode, body };
  };
  return {
    investor: { id: investorId },
    cookies,
    req: {
      get: (url) => send('GET', url),
      post: (url, payload) => send('POST', url, payload),
      put: (url, payload) => send('PUT', url, payload),
    },
  };
}
