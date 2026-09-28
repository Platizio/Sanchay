import { createHash } from 'node:crypto';
import type { ClsService } from 'nestjs-cls';
import { describe, expect, it } from 'vitest';
import { AppError } from '../platform/errors.js';
import type { ClientInfo, SanchayClsStore } from '../platform/request-context.js';
import { ensureWebDeviceCookie, requireAuth, requireDeviceContext } from './request-auth.js';

function fakeCls(initial: Partial<SanchayClsStore>): ClsService<SanchayClsStore> {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    get: (k: string) => store.get(k),
    set: (k: string, v: unknown) => {
      store.set(k, v);
    },
  } as unknown as ClsService<SanchayClsStore>;
}

const webClient: ClientInfo = { platform: 'WEB', deviceRef: null, appVersion: null };

describe('ensureWebDeviceCookie', () => {
  it('mints a 43-char __Host-sanchay_dev cookie on first web contact and stores it in CLS', () => {
    const cls = fakeCls({ client: webClient });
    const h = new Headers();
    ensureWebDeviceCookie(cls, h);
    const [cookie] = h.getSetCookie();
    const value = /^__Host-sanchay_dev=([A-Za-z0-9_-]{43});/.exec(cookie ?? '')?.[1];
    expect(value).toBeDefined();
    expect(cls.get('client')?.deviceRef).toBe(value);
  });

  it('keeps an existing device ref and writes nothing', () => {
    const cls = fakeCls({ client: { ...webClient, deviceRef: 'b'.repeat(43) } });
    const h = new Headers();
    ensureWebDeviceCookie(cls, h);
    expect(h.getSetCookie()).toEqual([]);
  });

  it('does nothing for Android clients', () => {
    const cls = fakeCls({
      client: {
        platform: 'ANDROID',
        deviceRef: '5f2b1c9e-8a7d-4c3b-9e1f-0a2b3c4d5e6f',
        appVersion: '1.0.0',
      },
    });
    const h = new Headers();
    ensureWebDeviceCookie(cls, h);
    expect(h.getSetCookie()).toEqual([]);
  });
});

describe('request context helpers', () => {
  it('requireDeviceContext hashes the device ref and carries ip and user agent', () => {
    const ref = '5f2b1c9e-8a7d-4c3b-9e1f-0a2b3c4d5e6f';
    const cls = fakeCls({
      client: { platform: 'ANDROID', deviceRef: ref, appVersion: '1.0.0' },
      ip: '203.0.113.10',
      userAgent: 'ua',
    });
    const ctx = requireDeviceContext(cls);
    expect(ctx.deviceRefHash.equals(createHash('sha256').update(ref).digest())).toBe(true);
    expect(ctx).toMatchObject({
      platform: 'ANDROID',
      appVersion: '1.0.0',
      ip: '203.0.113.10',
      userAgent: 'ua',
    });
  });

  it('requireAuth throws AUTH_REQUIRED without a session', () => {
    const cls = fakeCls({ client: webClient, auth: null });
    expect(() => requireAuth(cls)).toThrow(AppError);
    try {
      requireAuth(cls);
    } catch (e) {
      expect((e as AppError).code).toBe('AUTH_REQUIRED');
    }
  });
});
