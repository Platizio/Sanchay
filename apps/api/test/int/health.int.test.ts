import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, type TestApp } from './app.js';

let t: TestApp;

beforeAll(async () => {
  t = await bootTestApp();
});

afterAll(async () => {
  await t.close();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('health', () => {
  it('GET /api/v1/health is live, no-store, and carries a request id', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toMatch(UUID);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('echoes a valid incoming x-request-id', async () => {
    const id = '0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b';
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { 'x-request-id': id },
    });
    expect(res.headers['x-request-id']).toBe(id);
  });

  it('GET /api/v1/health/ready checks the database', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', checks: [{ name: 'database', ok: true }] });
  });

  it('returns the error envelope for unknown routes', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      defined: true,
      code: 'NOT_FOUND',
      status: 404,
      message: 'NOT_FOUND',
      data: { retryable: false, requestId: res.headers['x-request-id'] },
    });
  });
});

describe('client IP (H-1: IPv4 only, fail closed)', () => {
  it('refuses a non-IPv4 client with 422 CLIENT_IP_UNSUPPORTED', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/nope',
      remoteAddress: '2001:db8::7',
    });
    expect(res.statusCode).toBe(422);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toEqual({
      defined: true,
      code: 'CLIENT_IP_UNSUPPORTED',
      status: 422,
      message: 'CLIENT_IP_UNSUPPORTED',
      data: { retryable: false, requestId: res.headers['x-request-id'] },
    });
  });

  it('exempts the health endpoints (ALB health checks carry no X-Forwarded-For)', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/v1/health',
      remoteAddress: '2001:db8::7',
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('fastify limits', () => {
  it('caps request bodies at 100 KiB', () => {
    expect(t.app.getHttpAdapter().getInstance().initialConfig.bodyLimit).toBe(102_400);
  });
});
