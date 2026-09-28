import { type NextRequest, NextResponse } from 'next/server';
import { buildAppCsp, newNonce } from './lib/csp';
import { decideRoute, hasSessionCookie, hostKind } from './lib/routing';

function envOrigin(value: string | undefined): string | undefined {
  return value ? value : undefined;
}

export function proxy(request: NextRequest): NextResponse {
  const origins = {
    wwwOrigin: envOrigin(process.env.SANCHAY_WWW_ORIGIN),
    appOrigin: envOrigin(process.env.SANCHAY_APP_ORIGIN),
  };
  // No CloudFront in the MVP (H-1): the ALB forwards the client's Host header unchanged,
  // so x-forwarded-host is never trusted here.
  const host = request.headers.get('host');
  const { pathname, search } = request.nextUrl;
  const decision = decideRoute({
    kind: hostKind(host, origins),
    pathname,
    search,
    hasSessionCookie: hasSessionCookie(request.cookies),
    ...origins,
  });

  if (decision.action === 'redirect') {
    return NextResponse.redirect(new URL(decision.location, request.url), decision.status);
  }
  if (decision.action === 'rewrite') {
    return NextResponse.rewrite(new URL(decision.location, request.url));
  }
  if (decision.action === 'notFound') {
    return new NextResponse(null, { status: 404 });
  }
  if (!decision.appCsp) return NextResponse.next();

  const nonce = newNonce();
  const csp = buildAppCsp(nonce, { dev: process.env.NODE_ENV === 'development' });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  // Next.js reads the nonce from the request CSP header and stamps it on its own scripts. That only
  // works for pages rendered per request, so next.config.ts keeps cacheComponents off (ADR-0001 row, C11).
  requestHeaders.set('content-security-policy', csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', csp);
  response.headers.set('x-robots-tag', 'noindex');
  return response;
}

export const config = {
  matcher: [
    '/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|\\.well-known/).*)',
  ],
};
