import { getCookie, setCookie } from '@orpc/server/helpers';

export const SESSION_COOKIE = '__Host-sanchay_sid';
export const DEVICE_COOKIE = '__Host-sanchay_dev';
/** Non-HttpOnly, never-trusted indicator read by apps/web routing.ts (C10) for optimistic redirects (H-7). */
export const SESSION_INDICATOR_COOKIE = '__Host-sanchay_si';
/** 400 days, the browser cap for cookie lifetime. */
export const DEVICE_COOKIE_MAX_AGE_S = 34_560_000;

/** `__Host-` prefix rules: Secure, Path=/, and no Domain attribute. */
const BASE = { secure: true, sameSite: 'lax', path: '/' } as const;

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (cookieHeader === undefined || cookieHeader === '') return undefined;
  return getCookie(new Headers({ cookie: cookieHeader }), name);
}

export function writeSessionCookies(
  resHeaders: Headers | undefined,
  session: { token: string; absoluteExpiresAt: Date },
  now: Date,
): void {
  const maxAge = Math.max(
    0,
    Math.floor((session.absoluteExpiresAt.getTime() - now.getTime()) / 1000),
  );
  setCookie(resHeaders, SESSION_COOKIE, session.token, { ...BASE, httpOnly: true, maxAge });
  setCookie(resHeaders, SESSION_INDICATOR_COOKIE, '1', { ...BASE, httpOnly: false, maxAge });
}

export function clearSessionCookies(resHeaders: Headers | undefined): void {
  setCookie(resHeaders, SESSION_COOKIE, '', { ...BASE, httpOnly: true, maxAge: 0 });
  setCookie(resHeaders, SESSION_INDICATOR_COOKIE, '', { ...BASE, httpOnly: false, maxAge: 0 });
}

/** The 400-day HttpOnly __Host-sanchay_dev writer used by ensureWebDeviceCookie. */
export function writeDeviceCookie(resHeaders: Headers | undefined, value: string): void {
  setCookie(resHeaders, DEVICE_COOKIE, value, {
    ...BASE,
    httpOnly: true,
    maxAge: DEVICE_COOKIE_MAX_AGE_S,
  });
}
