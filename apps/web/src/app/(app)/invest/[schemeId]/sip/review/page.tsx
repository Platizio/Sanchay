import type { Metadata } from 'next';
import { SipReviewRoute } from '../../../../../../client/routes';

export const metadata: Metadata = { title: 'Review your SIP' };

export default async function SipReviewPage({
  params,
}: PageProps<'/invest/[schemeId]/sip/review'>) {
  const { schemeId } = await params;
  return <SipReviewRoute schemeId={schemeId} />;
}
