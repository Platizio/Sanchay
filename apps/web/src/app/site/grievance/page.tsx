import { dsc02 } from '@sanchay/app-core/copy';
import { readSiteConfig } from '../../../lib/site-config';

/** DSC-21: the public grievance-redressal contact page. */
export default function GrievancePage() {
  const site = readSiteConfig();
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-12">
      <h1 className="text-xl font-bold">Grievance redressal</h1>
      <p className="text-muted">
        If you have a complaint about your Sanchay account, an order, or a payment, write to our
        grievance officer at{' '}
        <a className="text-primary underline" href="mailto:grievance@sanchay.in">
          grievance@sanchay.in
        </a>
        . We aim to resolve every complaint within 21 working days, in line with AMFI&apos;s
        distributor code of conduct.
      </p>
      <p className="text-muted">
        If you are not satisfied with our response, you may escalate to SEBI&apos;s SCORES portal
        (scores.sebi.gov.in) or to AMFI directly.
      </p>
      <p className="text-sm text-muted">{dsc02(site.platformArn, site.platformArnValidTill)}</p>
    </main>
  );
}
