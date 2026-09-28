import { dsc02, MARKET_RISK_WARNING, REGULAR_PLAN_NOTICE } from '@sanchay/app-core/copy';
import { readSiteConfig } from '../../lib/site-config';

/** www landing (PUB-01). Static: the ARN and its validity date are read at build time. */
export default function SiteHomePage() {
  const site = readSiteConfig();
  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <span className="text-lg font-bold">Sanchay</span>
        <a
          className="inline-flex min-h-12 items-center rounded-md px-4 font-semibold text-primary"
          href={`${site.appOrigin}/login`}
        >
          Log in
        </a>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="text-xxl font-bold">Mutual fund investing, made clear.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted">
          Explore funds by SEBI category, invest once or through a SIP, and see exactly what you
          invested and what it is worth today.
        </p>
        <p className="mt-2 text-muted">Sanchay is invite-only during the pilot.</p>
        <a
          className="mt-8 inline-flex min-h-12 items-center rounded-md bg-primary px-6 font-semibold text-on-primary"
          href={`${site.appOrigin}/signup`}
        >
          Get started
        </a>
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-5xl space-y-2 px-4 py-6 text-sm text-muted">
          <p>{MARKET_RISK_WARNING}</p>
          <p>{dsc02(site.platformArn, site.platformArnValidTill)}</p>
          <p>{REGULAR_PLAN_NOTICE}</p>
        </div>
      </footer>
    </div>
  );
}
