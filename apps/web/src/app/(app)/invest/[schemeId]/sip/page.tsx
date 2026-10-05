import type { Metadata } from 'next';
import { SipSetupRoute } from '../../../../../client/routes';

export const metadata: Metadata = { title: 'Start a SIP' };

export default async function SipSetupPage({ params }: PageProps<'/invest/[schemeId]/sip'>) {
  const { schemeId } = await params;
  return <SipSetupRoute schemeId={schemeId} />;
}
