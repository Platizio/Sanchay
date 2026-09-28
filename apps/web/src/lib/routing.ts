/** Non-HttpOnly indicator the API writes next to the session cookie (H-7). Presence only; never trusted. */
export const SESSION_INDICATOR_COOKIE = '__Host-sanchay_si';
/** The HttpOnly web session cookie; only its presence is checked here, never its value. */
export const SESSION_COOKIE = '__Host-sanchay_sid';
/** www pages live under /site in the Next app; the www host is rewritten onto it (H-1). */
export const SITE_PREFIX = '/site';

export type HostKind = 'www' | 'app' | 'any';
export interface HostOrigins {
  wwwOrigin?: string | undefined;
  appOrigin?: string | undefined;
}
export type RouteDecision =
  | { action: 'next'; appCsp: boolean }
  | { action: 'redirect'; location: string; status: 307 | 308 }
  | { action: 'rewrite'; location: string }
  | { action: 'notFound' };
export interface RouteInput extends HostOrigins {
  kind: HostKind;
  pathname: string;
  search: string;
  hasSessionCookie: boolean;
}

const SAFE_NEXT = /^\/(?!\/)[A-Za-z0-9/_-]*$/;

export function hasSessionCookie(cookies: { has(name: string): boolean }): boolean {
  return cookies.has(SESSION_INDICATOR_COOKIE) || cookies.has(SESSION_COOKIE);
}

export function hostKind(host: string | null, origins: HostOrigins): HostKind {
  if (!origins.wwwOrigin || !origins.appOrigin) return 'any';
  const normalised = (host ?? '').toLowerCase();
  if (normalised === new URL(origins.appOrigin).host) return 'app';
  return 'www';
}

export function isSitePath(pathname: string): boolean {
  return pathname === SITE_PREFIX || pathname.startsWith(`${SITE_PREFIX}/`);
}

export function isPublicAppPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/r' ||
    pathname.startsWith('/r/')
  );
}

export function isProtectedPath(pathname: string): boolean {
  return !isSitePath(pathname) && !isPublicAppPath(pathname);
}

function isAppLinkPath(pathname: string): boolean {
  return pathname === '/app' || pathname.startsWith('/app/');
}

export function decideRoute(input: RouteInput): RouteDecision {
  const { kind, pathname, search } = input;
  if (kind === 'www') {
    if ((pathname === '/login' || pathname === '/signup') && input.appOrigin) {
      return {
        action: 'redirect',
        location: `${input.appOrigin}${pathname}${search}`,
        status: 308,
      };
    }
    return {
      action: 'rewrite',
      location: `${SITE_PREFIX}${pathname === '/' ? '' : pathname}${search}`,
    };
  }
  if (kind === 'app' && isSitePath(pathname)) return { action: 'notFound' };
  if (isAppLinkPath(pathname)) {
    const stripped = pathname.slice('/app'.length) || '/';
    return { action: 'redirect', location: `${stripped}${search}`, status: 307 };
  }
  if (isSitePath(pathname)) return { action: 'next', appCsp: false };
  if (isProtectedPath(pathname) && !input.hasSessionCookie) {
    const location = pathname === '/' ? '/login' : `/login?next=${encodeURIComponent(pathname)}`;
    return { action: 'redirect', location, status: 307 };
  }
  return { action: 'next', appCsp: true };
}

/** Open-redirect guard for ?next= (H-1): a same-origin path only, no query, no scheme, no backslash. */
export function safeNext(raw: string | null | undefined): string | null {
  return raw && SAFE_NEXT.test(raw) ? raw : null;
}
