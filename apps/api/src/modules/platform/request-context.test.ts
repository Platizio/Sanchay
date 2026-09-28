import { describe, expect, it } from 'vitest';
import { clientIpFrom, headerValue, requestIdFor, requiresClientIp } from './request-context.js';

const req = (headers: Record<string, string | string[]>, remoteAddress?: string) => ({
  headers,
  socket: { remoteAddress },
});

describe('requestIdFor', () => {
  it('keeps a well-formed x-request-id, lower-cased', () => {
    expect(requestIdFor('0199A0B2-3C4D-7E8F-9A0B-1C2D3E4F5A6B')).toBe(
      '0199a0b2-3c4d-7e8f-9a0b-1c2d3e4f5a6b',
    );
  });

  it('replaces malformed values with a fresh uuidv7', () => {
    expect(requestIdFor('abc; drop')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  });
});

describe('headerValue', () => {
  it('takes the first value of a repeated header', () => {
    expect(headerValue(['a', 'b'])).toBe('a');
    expect(headerValue(undefined)).toBeUndefined();
  });
});

describe('clientIpFrom (socket: local and test)', () => {
  it.each([
    ['203.0.113.10', '203.0.113.10'],
    ['::ffff:127.0.0.1', '127.0.0.1'],
    ['::1', '127.0.0.1'],
    ['2001:db8::1', null],
    [undefined, null],
  ])('socket %s gives %s', (remote, expected) => {
    expect(clientIpFrom(req({}, remote), 'socket')).toBe(expected);
  });

  it('ignores X-Forwarded-For in socket mode', () => {
    expect(clientIpFrom(req({ 'x-forwarded-for': '198.51.100.7' }, '10.0.0.5'), 'socket')).toBe(
      '10.0.0.5',
    );
  });
});

describe('clientIpFrom (alb: dev, staging, prod)', () => {
  it('takes the rightmost X-Forwarded-For entry, the one the ALB appended', () => {
    const spoofed = req({ 'x-forwarded-for': '1.2.3.4, 198.51.100.7' }, '10.0.0.9');
    expect(clientIpFrom(spoofed, 'alb')).toBe('198.51.100.7');
  });

  it('joins repeated X-Forwarded-For headers before taking the rightmost entry', () => {
    const repeated = req({ 'x-forwarded-for': ['1.2.3.4', '198.51.100.8'] }, '10.0.0.9');
    expect(clientIpFrom(repeated, 'alb')).toBe('198.51.100.8');
  });

  it('returns null for an IPv6 rightmost entry (IPv4-only MVP, H-1)', () => {
    expect(clientIpFrom(req({ 'x-forwarded-for': '1.2.3.4, 2001:db8::5' }), 'alb')).toBeNull();
  });

  it('returns null without X-Forwarded-For and never falls back to the socket', () => {
    expect(clientIpFrom(req({}, '10.0.0.9'), 'alb')).toBeNull();
  });
});

describe('requiresClientIp', () => {
  it.each([
    ['/api/v1/health', false],
    ['/api/v1/health/ready?probe=alb', false],
    ['/api/v1/auth/otp', true],
    ['/api/v1/healthz', true],
  ])('%s gives %s', (url, expected) => {
    expect(requiresClientIp(url)).toBe(expected);
  });
});
