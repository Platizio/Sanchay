import type { Metadata } from 'next';
import { AccountRoute } from '../../../client/routes';

export const metadata: Metadata = { title: 'Account' };

export default function AccountPage() {
  return <AccountRoute />;
}
