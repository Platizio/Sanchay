import { describe, expect, it } from 'vitest';
import { decideRoute, hasSessionCookie, hostKind, safeNext } from './routing';

const prod = { wwwOrigin: 'https://www.sanchay.in', appOrigin: 'https://app.sanchay.in' };
const signedOut = { search: '', hasSessionCookie: false };
const jar = (...names: string[]) => ({ has: (name: string) => names.includes(name) });

describe('hostKind', () => {
  it('is "any" when either origin is not configured (local single-host dev)', () => {
    expect(hostKind('localhost:3001', {})).toBe('any');
    expect(hostKind('localhost:3001', { wwwOrigin: '', appOrigin: '' })).toBe('any');
    expect(hostKind('app.sanchay.in', { appOrigin: 'https://app.sanchay.in' })).toBe('any');
  });
  it('recognises the app and www hosts case-insensitively', () => {
    expect(hostKind('APP.sanchay.in', prod)).toBe('app');
    expect(hostKind('www.sanchay.in', prod)).toBe('www');
  });
  it('treats unknown or missing hosts as www so the investor app is never served there', () => {
    expect(hostKind('evil.example', prod)).toBe('www');
    expect(hostKind(null, prod)).toBe('www');
  });
});

describe('hasSessionCookie', () => {
  it('accepts __Host-sanchay_si or __Host-sanchay_sid and nothing else', () => {
    expect(hasSessionCookie(jar('__Host-sanchay_si'))).toBe(true);
    expect(hasSessionCookie(jar('__Host-sanchay_sid'))).toBe(true);
    expect(hasSessionCookie(jar('sanchay_si'))).toBe(false);
    expect(hasSessionCookie(jar('__Host-sanchay_dev'))).toBe(false);
  });
});

describe('decideRoute on the www host', () => {
  const www = { ...prod, ...signedOut, kind: 'www' as const };
  it('sends /login and /signup to the app host with 308, keeping the query', () => {
    expect(decideRoute({ ...www, pathname: '/login', search: '?next=%2Fportfolio' })).toEqual({
      action: 'redirect',
      location: 'https://app.sanchay.in/login?next=%2Fportfolio',
      status: 308,
    });
    expect(decideRoute({ ...www, pathname: '/signup' })).toEqual({
      action: 'redirect',
      location: 'https://app.sanchay.in/signup',
      status: 308,
    });
  });
  it('rewrites every other path under /site, keeping the query', () => {
    expect(decideRoute({ ...www, pathname: '/' })).toEqual({
      action: 'rewrite',
      location: '/site',
    });
    expect(decideRoute({ ...www, pathname: '/commission-disclosure', search: '?v=2' })).toEqual({
      action: 'rewrite',
      location: '/site/commission-disclosure?v=2',
    });
    expect(decideRoute({ ...www, pathname: '/portfolio', hasSessionCookie: true })).toEqual({
      action: 'rewrite',
      location: '/site/portfolio',
    });
  });
});

describe('decideRoute on the app host', () => {
  const app = { ...prod, ...signedOut, kind: 'app' as const };
  it('returns 404 for www pages under /site', () => {
    expect(decideRoute({ ...app, pathname: '/site' })).toEqual({ action: 'notFound' });
    expect(
      decideRoute({ ...app, pathname: '/site/legal/privacy', hasSessionCookie: true }),
    ).toEqual({
      action: 'notFound',
    });
  });
  it('redirects App Link paths /app/<p> to /<p> with 307, keeping the query', () => {
    expect(decideRoute({ ...app, pathname: '/app' })).toEqual({
      action: 'redirect',
      location: '/',
      status: 307,
    });
    expect(decideRoute({ ...app, pathname: '/app/portfolio', search: '?tab=sips' })).toEqual({
      action: 'redirect',
      location: '/portfolio?tab=sips',
      status: 307,
    });
  });
  it('sends protected paths without a session to /login, with next for anything but /', () => {
    expect(decideRoute({ ...app, pathname: '/' })).toEqual({
      action: 'redirect',
      location: '/login',
      status: 307,
    });
    expect(decideRoute({ ...app, pathname: '/portfolio/holdings/F1/INF200K01RJ1' })).toEqual({
      action: 'redirect',
      location: '/login?next=%2Fportfolio%2Fholdings%2FF1%2FINF200K01RJ1',
      status: 307,
    });
    expect(decideRoute({ ...app, pathname: '/explore', search: '?q=axis' })).toEqual({
      action: 'redirect',
      location: '/login?next=%2Fexplore',
      status: 307,
    });
  });
  it('treats /apple as an ordinary protected path, not an App Link', () => {
    expect(decideRoute({ ...app, pathname: '/apple' })).toEqual({
      action: 'redirect',
      location: '/login?next=%2Fapple',
      status: 307,
    });
  });
  it('serves /login, /signup and /r/* without a session, under the app CSP', () => {
    for (const pathname of ['/login', '/signup', '/r/payment']) {
      expect(decideRoute({ ...app, pathname })).toEqual({ action: 'next', appCsp: true });
    }
  });
  it('serves protected paths with a session cookie under the app CSP', () => {
    expect(decideRoute({ ...app, pathname: '/', hasSessionCookie: true })).toEqual({
      action: 'next',
      appCsp: true,
    });
    expect(decideRoute({ ...app, pathname: '/account', hasSessionCookie: true })).toEqual({
      action: 'next',
      appCsp: true,
    });
  });
});

describe('decideRoute on a single local host (any)', () => {
  const local = { ...signedOut, kind: 'any' as const };
  it('serves www pages at /site without the app CSP or a session', () => {
    expect(decideRoute({ ...local, pathname: '/site' })).toEqual({ action: 'next', appCsp: false });
    expect(decideRoute({ ...local, pathname: '/site/legal/privacy' })).toEqual({
      action: 'next',
      appCsp: false,
    });
  });
  it('still guards the investor app and strips /app', () => {
    expect(decideRoute({ ...local, pathname: '/' })).toEqual({
      action: 'redirect',
      location: '/login',
      status: 307,
    });
    expect(decideRoute({ ...local, pathname: '/app/account' })).toEqual({
      action: 'redirect',
      location: '/account',
      status: 307,
    });
  });
});

describe('safeNext', () => {
  it.each([
    '/',
    '/portfolio',
    '/portfolio/holdings/F1/INF200K01RJ1',
    '/funds/axis-bluechip_fund-regular-growth',
  ])('keeps %s', (raw) => {
    expect(safeNext(raw)).toBe(raw);
  });
  it.each<string | null | undefined>([
    'https://evil.example/',
    '//evil.example',
    '/\\evil.example',
    '/portfolio?tab=sips',
    '/%2F%2Fevil.example',
    '/a b',
    '',
    null,
    undefined,
  ])('rejects %j', (raw) => {
    expect(safeNext(raw)).toBeNull();
  });
});
