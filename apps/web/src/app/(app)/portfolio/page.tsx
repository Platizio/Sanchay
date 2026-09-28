import type { Metadata } from 'next';
import { ComingSoonRoute } from '../../../client/routes';

export const metadata: Metadata = { title: 'Portfolio' };

export default function PortfolioPage() {
  return <ComingSoonRoute title="Portfolio" />;
}
