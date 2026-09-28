import { connection } from 'next/server';
import { type ReactNode, Suspense } from 'react';
import { WebAppProviders } from '../../client/WebAppProviders';
import { readSiteConfig, wwwUrl } from '../../lib/site-config';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <DynamicAuth>{children}</DynamicAuth>
    </Suspense>
  );
}

async function DynamicAuth({ children }: { children: ReactNode }) {
  // Per-request rendering lets Next stamp the per-request CSP nonce (cacheComponents is off).
  await connection();
  const site = readSiteConfig();
  return (
    <WebAppProviders privacyNoticeUrl={wwwUrl(site, '/legal/privacy')}>{children}</WebAppProviders>
  );
}
