import { connection } from 'next/server';
import { type ReactNode, Suspense } from 'react';
import { AppShellRoute } from '../../client/routes';
import { WebAppProviders } from '../../client/WebAppProviders';
import { readSiteConfig, wwwUrl } from '../../lib/site-config';

export default function InvestorAppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <DynamicApp>{children}</DynamicApp>
    </Suspense>
  );
}

async function DynamicApp({ children }: { children: ReactNode }) {
  // Per-request rendering keeps every script under the request nonce.
  await connection();
  const site = readSiteConfig();
  return (
    <WebAppProviders privacyNoticeUrl={wwwUrl(site, '/legal/privacy')}>
      <AppShellRoute>{children}</AppShellRoute>
    </WebAppProviders>
  );
}
