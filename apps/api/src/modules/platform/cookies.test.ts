import { describe, expect, it } from 'vitest';
import {
  clearSessionCookies,
  DEVICE_COOKIE,
  readCookie,
  SESSION_COOKIE,
  SESSION_INDICATOR_COOKIE,
  writeDeviceCookie,
  writeSessionCookies,
} from './cookies.js';

const now = new Date('2026-10-12T04:30:00.000Z');
const token = 'a'.repeat(43);

describe('session cookies (H-7)', () => {
  it('writes the HttpOnly sid and the readable __Host- indicator, both expiring at the absolute expiry', () => {
    expect([SESSION_COOKIE, SESSION_INDICATOR_COOKIE, DEVICE_COOKIE]).toEqual([
      '__Host-sanchay_sid',
      '__Host-sanchay_si',
      '__Host-sanchay_dev',
    ]);
    const h = new Headers();
    writeSessionCookies(h, { token, absoluteExpiresAt: new Date(now.getTime() + 43_200_000) }, now);
    const [sid, si] = h.getSetCookie();
    expect(h.getSetCookie()).toHaveLength(2);
    expect(sid).toMatch(new RegExp(`^${SESSION_COOKIE}=${token};`));
    for (const part of ['Max-Age=43200', 'Path=/', 'HttpOnly', 'Secure'])
      expect(sid).toContain(part);
    expect(sid).toMatch(/SameSite=Lax/i);
    expect(si).toMatch(new RegExp(`^${SESSION_INDICATOR_COOKIE}=1;`));
    for (const part of ['Max-Age=43200', 'Path=/', 'Secure']) expect(si).toContain(part);
    expect(si).not.toContain('HttpOnly');
    for (const c of h.getSetCookie()) expect(c).not.toMatch(/Domain=/i);
  });

  it('never writes a negative Max-Age', () => {
    const h = new Headers();
    writeSessionCookies(h, { token, absoluteExpiresAt: new Date(now.getTime() - 5_000) }, now);
    expect(h.getSetCookie()[0]).toContain('Max-Age=0');
  });

  it('clears both cookies', () => {
    const h = new Headers();
    clearSessionCookies(h);
    const [sid, si] = h.getSetCookie();
    expect(sid).toMatch(new RegExp(`^${SESSION_COOKIE}=;`));
    expect(sid).toContain('Max-Age=0');
    expect(si).toMatch(new RegExp(`^${SESSION_INDICATOR_COOKIE}=;`));
    expect(si).toContain('Max-Age=0');
  });

  it('writes the 400-day HttpOnly device cookie', () => {
    const h = new Headers();
    writeDeviceCookie(h, token);
    const [dev] = h.getSetCookie();
    expect(dev).toMatch(new RegExp(`^${DEVICE_COOKIE}=${token};`));
    expect(dev).toContain('Max-Age=34560000');
    expect(dev).toContain('HttpOnly');
    expect(dev).toContain('Path=/');
  });

  it('reads one cookie out of a Cookie header', () => {
    expect(readCookie(`a=1; ${SESSION_COOKIE}=${token}; b=2`, SESSION_COOKIE)).toBe(token);
    expect(readCookie('a=1', SESSION_COOKIE)).toBeUndefined();
    expect(readCookie(undefined, SESSION_COOKIE)).toBeUndefined();
  });
});
