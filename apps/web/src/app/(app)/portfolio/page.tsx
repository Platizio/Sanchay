import type { Metadata } from 'next';
import { PortfolioRoute } from '../../../client/routes';

export const metadata: Metadata = { title: 'Portfolio' };

export default function PortfolioPage() {
  return <PortfolioRoute />;
}
