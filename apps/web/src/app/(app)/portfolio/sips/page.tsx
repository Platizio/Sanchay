import type { Metadata } from 'next';
import { SipListRoute } from '../../../../client/routes';

export const metadata: Metadata = { title: 'SIPs' };

export default function SipListPage() {
  return <SipListRoute />;
}
