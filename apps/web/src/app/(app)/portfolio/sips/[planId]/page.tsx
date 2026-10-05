import type { Metadata } from 'next';
import { SipDetailRoute } from '../../../../../client/routes';

export const metadata: Metadata = { title: 'SIP' };

export default async function SipDetailPage({ params }: PageProps<'/portfolio/sips/[planId]'>) {
  const { planId } = await params;
  return <SipDetailRoute planId={planId} />;
}
