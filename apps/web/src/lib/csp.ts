export function buildAppCsp(nonce: string, options: { dev: boolean }): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(options.dev ? ["'unsafe-eval'"] : []),
  ];
  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    // react-native-web inserts atomic CSS at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    // P2-2 adds the self-hosted Sentry host here.
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' https://*.fintechprimitives.com https://*.cybrilla.com",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');
}

export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
